import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Group, SegmentedControl, Skeleton, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { EmptyState, Metric, MetricGrid, Page, Section } from '@mvv42/kit';
import { IconArrowLeft, IconArrowsExchange, IconPlus } from '@tabler/icons-react';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { OperationList } from '../components/OperationList/OperationList';
import { ListSkeleton } from '../components/RouterListRow';
import { confirmOperation, deleteOperation } from '../api/operations';
import type { PlannedOperation } from '../api/types';
import { formatMoney, formatMoneyWithSign } from '../utils/formatMoney';
import { getDateRange } from '../utils/formatDate';
import { accountTypeColors, accountTypeLabels } from '../utils/colors';
import { creditUsage, daysUntilDue } from '../utils/accounts';

type PeriodValue = 'week' | 'month' | 'year';

const PERIOD_LABEL: Record<PeriodValue, string> = { week: 'за неделю', month: 'за месяц', year: 'за год' };

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { accounts, loading: accLoading, fetch: fetchAccounts } = useAccountStore();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    const range = getDateRange(period);
    void fetchOps({ ...range, accountId: Number(id), limit: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period]);

  const back = (
    <Button component={Link} to="/accounts" variant="default" leftSection={<IconArrowLeft size={16} />}>
      Все счета
    </Button>
  );

  if (!account) {
    return (
      <Page>
        {accLoading || accounts.length === 0 ? (
          <Skeleton h={160} />
        ) : (
          <EmptyState title="Счёт не найден" description="Возможно, он удалён или архивирован." action={back} />
        )}
      </Page>
    );
  }

  const mainBal = account.balances[0];
  const income = operations.filter((o) => o.amount > 0 && o.currency === mainBal?.currency).reduce((s, o) => s + o.amount, 0);
  const expense = operations.filter((o) => o.amount < 0 && o.currency === mainBal?.currency).reduce((s, o) => s + o.amount, 0);
  const planned = operations.filter((o) => !o.isConfirmed).length;
  const usage = creditUsage(account);
  const daysLeft = daysUntilDue(account);

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

  const currency = mainBal?.currency ?? 'RUB';

  return (
    <Page
      eyebrow={<Link to="/accounts" className="mvv-link">← Счета</Link>}
      title={
        <Group gap="sm" component="span">
          {account.name}
          <Badge color={accountTypeColors[account.type]} size="sm">
            {accountTypeLabels[account.type]}
          </Badge>
        </Group>
      }
      width="wide"
      actions={
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditingOp(undefined);
            openForm();
          }}
        >
          Добавить операцию
        </Button>
      }
    >
      <MetricGrid>
        <Metric
          label="Баланс"
          value={mainBal ? formatMoney(mainBal.amount, mainBal.currency) : '—'}
          hint={account.balances.length > 1 ? account.balances.slice(1).map((b) => formatMoney(b.amount, b.currency)).join(' · ') : undefined}
        />
        <Metric label={`Поступления ${PERIOD_LABEL[period]}`} value={formatMoneyWithSign(income, currency)} loading={opLoading} />
        <Metric label={`Списания ${PERIOD_LABEL[period]}`} value={formatMoneyWithSign(expense, currency)} loading={opLoading} />
        {usage != null ? (
          <Metric
            label="Использование лимита"
            value={`${usage.toFixed(0)}%`}
            hint={daysLeft != null ? `до оплаты ${daysLeft} дн.` : undefined}
          />
        ) : (
          <Metric label="Плановых операций" value={String(planned)} loading={opLoading} />
        )}
      </MetricGrid>

      <Section
        title="Операции по счёту"
        padding="none"
        actions={
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
        }
      >
        {opLoading ? (
          <ListSkeleton rows={4} height={24} />
        ) : operations.length === 0 ? (
          <EmptyState
            compact
            icon={<IconArrowsExchange size={22} />}
            title="Нет операций за выбранный период"
            description={<Text span fz="sm">Выберите период шире или добавьте операцию.</Text>}
          />
        ) : (
          <OperationList
            operations={operations}
            categories={categories}
            onEdit={(op) => {
              setEditingOp(op);
              openForm();
            }}
            onDelete={(op) => handleDelete(op.id)}
            onConfirm={(op) => handleConfirm(op.id)}
          />
        )}
      </Section>

      <OperationForm
        key={editingOp?.id ?? 'new'}
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
    </Page>
  );
}
