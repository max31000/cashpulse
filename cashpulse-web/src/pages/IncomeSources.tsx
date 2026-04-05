import { useEffect, useState } from 'react';
import { Stack, Title, Button, Text, Paper, Group, Badge, Skeleton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useOperationStore } from '../store/useOperationStore';
import { useAccountStore } from '../store/useAccountStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { OperationForm } from '../components/OperationForm/OperationForm';
import type { PlannedOperation } from '../api/types';
import { formatMoney } from '../utils/formatMoney';

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Ежедневно',
  weekly: 'Еженедельно',
  biweekly: 'Каждые 2 недели',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  yearly: 'Ежегодно',
  custom: 'Произвольно',
};

export default function IncomeSources() {
  const { operations, loading, fetch: fetchOps } = useOperationStore();
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();
  const { scenarios, fetch: fetchScenarios } = useScenarioStore();
  const [formOpened, { open, close }] = useDisclosure(false);
  const [editingOp, setEditingOp] = useState<PlannedOperation | undefined>();

  useEffect(() => {
    void fetchOps({ limit: 500 });
    void fetchAccounts();
    void fetchCategories();
    void fetchScenarios();
  }, []);

  // Фильтруем: повторяющиеся + доход (amount > 0)
  const incomeSources = operations.filter(
    (op) => op.recurrenceRuleId != null && op.amount > 0
  );

  const accountName = (id: number) =>
    accounts.find((a) => a.id === id)?.name ?? `Счёт #${id}`;

  const handleEdit = (op: PlannedOperation) => {
    setEditingOp(op);
    open();
  };

  const handleAdd = () => {
    setEditingOp(undefined);
    open();
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Источники дохода</Title>
        <Button onClick={handleAdd}>+ Добавить</Button>
      </Group>

      <Text c="dimmed" size="sm">
        Регулярные поступления: зарплата, проценты по вкладам, купоны и другие стабильные доходы.
      </Text>

      {loading && <Skeleton h={80} />}

      {!loading && incomeSources.length === 0 && (
        <Paper p="xl" withBorder ta="center">
          <Text c="dimmed">Нет источников дохода. Добавьте первый.</Text>
        </Paper>
      )}

      {incomeSources.map((op) => (
        <Paper key={op.id} p="md" withBorder style={{ cursor: 'pointer' }}
          onClick={() => handleEdit(op)}>
          <Group justify="space-between">
            <Stack gap={4}>
              <Group gap="xs">
                <Text fw={600}>{op.description || 'Без описания'}</Text>
                {op.tags?.map((tag) => (
                  <Badge key={tag} size="xs" variant="light">{tag}</Badge>
                ))}
              </Group>
              <Text size="sm" c="dimmed">
                {accountName(op.accountId)}
                {op.recurrenceRule && ` · ${RECURRENCE_LABELS[op.recurrenceRule.type] ?? op.recurrenceRule.type}`}
                {op.recurrenceRule?.dayOfMonth && ` · ${op.recurrenceRule.dayOfMonth}-го числа`}
              </Text>
            </Stack>
            <Text fw={700} c="green" size="lg">
              +{formatMoney(op.amount, op.currency)}
            </Text>
          </Group>
        </Paper>
      ))}

      <OperationForm
        opened={formOpened}
        onClose={close}
        onSave={(savedOp) => {
          if (editingOp) useOperationStore.getState().updateOperation(savedOp);
          else useOperationStore.getState().addOperation(savedOp);
          close();
        }}
        accounts={accounts}
        categories={categories}
        scenarios={scenarios}
        initialValues={editingOp}
      />
    </Stack>
  );
}
