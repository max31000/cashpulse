import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Stack, Group, Text, Switch, Paper, Button, Breadcrumbs, Anchor,
  Badge, Skeleton, Divider
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useScenarioStore } from '../store/useScenarioStore';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { toggleScenario } from '../api/scenarios';
import { confirmOperation, deleteOperation } from '../api/operations';
import { notifications } from '@mantine/notifications';
import type { PlannedOperation } from '../api/types';
import { formatMoneyWithSign } from '../utils/formatMoney';
import { formatDateCompact, formatDateWithWeekday } from '../utils/formatDate';
import { tagColor } from '../utils/colors';

export default function ScenarioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { scenarios, fetch: fetchScenarios, updateScenario } = useScenarioStore();
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { operations, loading: opLoading, fetch: fetchOps } = useOperationStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editingOp, setEditingOp] = useState<PlannedOperation | undefined>();

  const scenario = scenarios.find((s) => s.id === Number(id));

  useEffect(() => {
    if (scenarios.length === 0) void fetchScenarios();
    void fetchAccounts();
    void fetchCategories();
  }, []);

  useEffect(() => {
    if (!id) return;
    void fetchOps({ scenarioId: Number(id), limit: 200 });
  }, [id]);

  if (!scenario) {
    return (
      <Stack>
        <Skeleton h={200} />
      </Stack>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const grouped = operations.reduce<Record<string, PlannedOperation[]>>((acc, op) => {
    const date = op.operationDate ?? op.createdAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(op);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleToggle = async () => {
    try {
      const result = await toggleScenario(scenario.id);
      updateScenario(result);
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleConfirm = async (opId: number) => {
    try {
      await confirmOperation(opId);
      const store = useOperationStore.getState();
      const existing = store.operations.find((o) => o.id === opId);
      if (existing) store.updateOperation({ ...existing, isConfirmed: true });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleDelete = async (opId: number) => {
    if (!confirm('Удалить операцию?')) return;
    try {
      await deleteOperation(opId);
      useOperationStore.getState().removeOperation(opId);
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Anchor onClick={() => navigate('/scenarios')} fz="sm">Сценарии</Anchor>
        <Text fz="sm">{scenario.name}</Text>
      </Breadcrumbs>

      <Paper p="lg" withBorder>
        <Group justify="space-between" mb="sm">
          <Text fz="xl" fw={700}>{scenario.name}</Text>
          <Switch
            label="Активен"
            checked={scenario.isActive}
            onChange={() => handleToggle()}
          />
        </Group>
        {scenario.description && (
          <Text c="dimmed" fz="sm">{scenario.description}</Text>
        )}
      </Paper>

      <Group justify="space-between">
        <Text fw={600}>Операции сценария</Text>
        <Button size="xs" variant="filled" onClick={() => { setEditingOp(undefined); openForm(); }}>
          + Добавить операцию
        </Button>
      </Group>

      {opLoading ? (
        <Stack gap="xs">
          {[1,2,3,4,5].map(i => <Skeleton key={i} h={48} />)}
        </Stack>
      ) : operations.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Нет операций в этом сценарии</Text>
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
                        borderLeft: `4px solid ${op.isConfirmed ? '#22C55E' : '#3B82F6'}`,
                      }}>
                      <Group justify="space-between" wrap="nowrap">
                        <Stack gap={2}>
                          <Text fw={600} fz="sm">{op.description ?? `#${op.id}`}</Text>
                          <Group gap={4}>
                            {op.tags?.map(t => <Badge key={t} size="xs" variant="dot" color={tagColor(t)}>{t}</Badge>)}
                          </Group>
                        </Stack>
                        <Group gap="xs" wrap="nowrap">
                          <Text fz="sm" fw={700} c={op.amount >= 0 ? 'green' : 'red'}>
                            {formatMoneyWithSign(op.amount, op.currency)}
                          </Text>
                          <Text fz="xs" c="dimmed">{op.operationDate ? formatDateCompact(op.operationDate) : '—'}</Text>
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
        }}
        accounts={accounts}
        categories={categories}
        scenarios={scenarios}
        initialValues={editingOp}
        fixedScenarioId={scenario.id}
      />
    </Stack>
  );
}
