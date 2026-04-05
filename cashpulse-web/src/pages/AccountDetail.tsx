import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Stack, Group, Text, Badge, Button, Breadcrumbs, Anchor, Paper, SegmentedControl, Skeleton,
  Divider
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { confirmOperation, deleteOperation } from '../api/operations';
import { notifications } from '@mantine/notifications';
import type { PlannedOperation } from '../api/types';
import { formatMoney, formatMoneyWithSign } from '../utils/formatMoney';
import { formatDateCompact, formatDateWithWeekday, getDateRange } from '../utils/formatDate';
import { accountTypeColors, accountTypeLabels, tagColor } from '../utils/colors';

type PeriodValue = 'week' | 'month' | 'year';

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { operations, loading: opLoading, fetch: fetchOps } = useOperationStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();
  const { scenarios, fetch: fetchScenarios } = useScenarioStore();


  const [period, setPeriod] = useState<PeriodValue>('month');
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editingOp, setEditingOp] = useState<PlannedOperation | undefined>();

  const account = accounts.find((a) => a.id === Number(id));

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();
    void fetchScenarios();
  }, []);

  useEffect(() => {
    if (!id) return;
    const range = getDateRange(period);
    void fetchOps({ ...range, accountId: Number(id), limit: 200 });
  }, [id, period]);

  if (!account) {
    return (
      <Stack>
        <Text c="dimmed">Счёт не найден</Text>
        <Button onClick={() => navigate('/accounts')}>← Назад к счетам</Button>
      </Stack>
    );
  }

  const mainBal = account.balances[0];
  const today = new Date().toISOString().split('T')[0];

  const grouped = operations.reduce<Record<string, PlannedOperation[]>>((acc, op) => {
    const date = op.operationDate ?? op.createdAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(op);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleConfirm = async (opId: number) => {
    try {
      await confirmOperation(opId);
      const store = useOperationStore.getState();
      const existing = store.operations.find((o) => o.id === opId);
      if (existing) store.updateOperation({ ...existing, isConfirmed: true });
      void fetchAccounts();
      notifications.show({ title: 'Подтверждено', message: 'Операция подтверждена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleDelete = async (opId: number) => {
    if (!confirm('Удалить операцию?')) return;
    try {
      await deleteOperation(opId);
      useOperationStore.getState().removeOperation(opId);
      void fetchAccounts();
      notifications.show({ title: 'Удалено', message: 'Операция удалена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Anchor onClick={() => navigate('/accounts')} fz="sm">Счета</Anchor>
        <Text fz="sm">{account.name}</Text>
      </Breadcrumbs>

      <Paper p="lg" withBorder>
        <Group justify="space-between" mb="md">
          <div>
            <Text fz="xl" fw={700}>{account.name}</Text>
            <Badge color={accountTypeColors[account.type]}>{accountTypeLabels[account.type]}</Badge>
          </div>
          <Text fz="2xl" fw={700} c={mainBal?.amount < 0 ? 'red' : 'blue'}>
            {mainBal ? formatMoney(mainBal.amount, mainBal.currency) : '—'}
          </Text>
        </Group>
        {account.balances.slice(1).map(b => (
          <Text key={b.currency} fz="sm" c="dimmed">{formatMoney(b.amount, b.currency)}</Text>
        ))}
      </Paper>

      <Group justify="space-between">
        <Text fw={600}>Операции по счёту</Text>
        <Group>
          <SegmentedControl
            size="xs"
            value={period}
            onChange={(v) => setPeriod(v as PeriodValue)}
            data={[
              { label: 'Неделя', value: 'week' },
              { label: 'Месяц', value: 'month' },
              { label: 'Год', value: 'year' },
            ]}
          />
          <Button size="xs" variant="filled" onClick={() => { setEditingOp(undefined); openForm(); }}>
            + Добавить
          </Button>
        </Group>
      </Group>

      {opLoading ? (
        <Stack gap="xs">
          {[1,2,3,4,5].map(i => <Skeleton key={i} h={48} />)}
        </Stack>
      ) : operations.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Нет операций за выбранный период</Text>
      ) : (
        <Stack gap="sm">
          {sortedDates.map((date) => (
            <div key={date}>
              <Divider label={<Text fz="xs" c="dimmed" tt="capitalize">{formatDateWithWeekday(date)}</Text>} labelPosition="left" mb="xs" />
              <Stack gap={4}>
                {grouped[date].map((op) => {
                  const isFuture = op.operationDate ? op.operationDate > today : false;
                  return (
                    <Paper key={op.id} px="md" py="sm" radius="sm"
                      style={{
                        opacity: isFuture ? 0.75 : 1,
                        borderLeft: `4px ${isFuture ? 'dashed' : 'solid'} ${op.isConfirmed ? '#22C55E' : '#3B82F6'}`,
                      }}>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          <Stack gap={2}>
                            <Text fw={600} fz="sm">{op.description ?? `#${op.id}`}</Text>
                            <Group gap={4}>
                              {op.tags?.map(t => <Badge key={t} size="xs" variant="dot" color={tagColor(t)}>{t}</Badge>)}
                              {op.recurrenceRuleId && <Text fz="xs" c="dimmed">🔁</Text>}
                            </Group>
                          </Stack>
                        </Group>
                        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                          <Text fz="sm" fw={700} c={op.amount >= 0 ? 'green' : 'red'}>
                            {formatMoneyWithSign(op.amount, op.currency)}
                          </Text>
                          <Text fz="xs" c="dimmed" w={45}>{op.operationDate ? formatDateCompact(op.operationDate) : '—'}</Text>
                          <Button size="xs" variant="subtle" onClick={() => { setEditingOp(op); openForm(); }}>✏️</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(op.id)}>🗑️</Button>
                          {!op.isConfirmed && <Button size="xs" variant="subtle" color="green" onClick={() => handleConfirm(op.id)}>✓</Button>}
                        </Group>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </div>
          ))}
        </Stack>
      )}

      <OperationForm
        opened={formOpened}
        onClose={closeForm}
        onSave={(op) => {
          if (editingOp) useOperationStore.getState().updateOperation(op);
          else useOperationStore.getState().addOperation(op);
          void fetchAccounts();
        }}
        accounts={accounts}
        categories={categories}
        scenarios={scenarios}
        initialValues={editingOp}
        fixedAccountId={account.id}
      />
    </Stack>
  );
}
