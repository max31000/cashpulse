import { useEffect, useState } from 'react';
import {
  Stack, Group, Button, Text, Paper, Badge, ActionIcon, Divider,
  Select, SegmentedControl, TextInput, Skeleton, Center
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useDebounce } from '../hooks/useDebounce';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { confirmOperation, deleteOperation } from '../api/operations';
import type { PlannedOperation } from '../api/types';
import { formatMoney, formatMoneyWithSign } from '../utils/formatMoney';
import { formatDateWithWeekday, getDateRange, toISODateString } from '../utils/formatDate';
import { tagColor, accountTypeColors } from '../utils/colors';

type PeriodValue = 'week' | 'month' | 'quarter' | 'year' | 'all';
type TypeValue = 'all' | 'income' | 'expense';
type StatusValue = 'all' | 'confirmed' | 'planned';

export default function Operations() {
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { operations, loading, fetch: fetchOps } = useOperationStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();
  const { scenarios, fetch: fetchScenarios } = useScenarioStore();
  const { baseCurrency } = useSettingsStore();

  const [period, setPeriod] = useState<PeriodValue>('month');
  const [typeFilter, setTypeFilter] = useState<TypeValue>('all');
  const [statusFilter, setStatusFilter] = useState<StatusValue>('all');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editingOp, setEditingOp] = useState<PlannedOperation | undefined>();

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();
    void fetchScenarios();
  }, []);

  useEffect(() => {
    const range = getDateRange(period);
    const isConfirmed = statusFilter === 'all' ? undefined : statusFilter === 'confirmed';
    void fetchOps({
      ...range,
      accountId: accountFilter ? Number(accountFilter) : undefined,
      categoryId: categoryFilter ? Number(categoryFilter) : undefined,
      isConfirmed,
      limit: 200,
    });
  }, [period, statusFilter, accountFilter, categoryFilter]);

  const filtered = operations.filter((op) => {
    if (typeFilter === 'income' && op.amount <= 0) return false;
    if (typeFilter === 'expense' && op.amount >= 0) return false;
    if (debouncedSearch && !(op.description ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, PlannedOperation[]>>((acc, op) => {
    const date = op.operationDate ?? op.createdAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(op);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleConfirm = async (id: number) => {
    try {
      await confirmOperation(id);
      const store = useOperationStore.getState();
      const existing = store.operations.find((o) => o.id === id);
      if (existing) store.updateOperation({ ...existing, isConfirmed: true });
      notifications.show({ title: 'Подтверждено', message: 'Операция подтверждена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить операцию? Это действие необратимо.')) return;
    try {
      await deleteOperation(id);
      useOperationStore.getState().removeOperation(id);
      notifications.show({ title: 'Удалено', message: 'Операция удалена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const today = toISODateString(new Date());

  return (
    <Stack gap="md">
      <Group justify="space-between" mb="xs">
        <Text fz="xl" fw={700}>Операции</Text>
        <Button variant="filled" onClick={() => { setEditingOp(undefined); openForm(); }}>
          + Добавить операцию
        </Button>
      </Group>

      {/* Toolbar */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group wrap="wrap" gap="sm">
            <SegmentedControl
              size="xs"
              value={period}
              onChange={(v) => setPeriod(v as PeriodValue)}
              data={[
                { label: 'Неделя', value: 'week' },
                { label: 'Месяц', value: 'month' },
                { label: 'Квартал', value: 'quarter' },
                { label: 'Год', value: 'year' },
                { label: 'Всё', value: 'all' },
              ]}
            />
            <SegmentedControl
              size="xs"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TypeValue)}
              data={[
                { label: 'Все', value: 'all' },
                { label: 'Доходы', value: 'income' },
                { label: 'Расходы', value: 'expense' },
              ]}
            />
            <Select
              size="xs"
              placeholder="Все счета"
              data={activeAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
              value={accountFilter}
              onChange={setAccountFilter}
              clearable
              searchable
              w={160}
            />
            <Select
              size="xs"
              placeholder="Все категории"
              data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
              searchable
              w={160}
            />
            <SegmentedControl
              size="xs"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusValue)}
              data={[
                { label: 'Все', value: 'all' },
                { label: 'План', value: 'planned' },
                { label: 'Факт', value: 'confirmed' },
              ]}
            />
          </Group>
          <TextInput
            size="xs"
            placeholder="🔍 Поиск по описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            w={{ base: '100%', sm: 300 }}
          />
        </Stack>
      </Paper>

      {/* Operations list */}
      {loading ? (
        <Stack gap="xs">
          {[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} h={48} />)}
        </Stack>
      ) : filtered.length === 0 ? (
        <Center h={300}>
          <Stack align="center" gap="md">
            <Text fz="4xl">📋</Text>
            <Text fw={600} fz="lg">Нет операций за выбранный период</Text>
            <Text c="dimmed" fz="sm">Создайте первую операцию или измените фильтры</Text>
            <Group>
              <Button variant="filled" onClick={() => { setEditingOp(undefined); openForm(); }}>
                + Добавить операцию
              </Button>
              <Button variant="subtle" onClick={() => { setPeriod('all'); setTypeFilter('all'); setStatusFilter('all'); setAccountFilter(null); setCategoryFilter(null); setSearchQuery(''); }}>
                Сбросить фильтры
              </Button>
            </Group>
          </Stack>
        </Center>
      ) : (
        <Stack gap="sm">
          {sortedDates.map((date) => (
            <div key={date}>
              <Divider
                label={
                  <Text fz="xs" c="dimmed" tt="capitalize">{formatDateWithWeekday(date)}</Text>
                }
                labelPosition="left"
                mb="xs"
              />
              <Stack gap={4}>
                {grouped[date].map((op) => {
                  const isPast = op.operationDate ? op.operationDate < today : false;
                  const isFuture = op.operationDate ? op.operationDate > today : false;
                  const account = accounts.find((a) => a.id === op.accountId);
                  const category = categories.find((c) => c.id === op.categoryId);

                  return (
                    <Paper
                      key={op.id}
                      px="md"
                      py="sm"
                      radius="sm"
                      style={{
                        opacity: isFuture ? 0.75 : 1,
                        borderLeft: `4px ${isFuture ? 'dashed' : 'solid'} ${op.isConfirmed ? '#22C55E' : '#3B82F6'}`,
                        backgroundColor: !op.isConfirmed && isPast ? 'rgba(234, 179, 8, 0.05)' : undefined,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ flex: 1, overflow: 'hidden' }}>
                          {category?.color && (
                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: category.color, flexShrink: 0 }} />
                          )}
                          <Stack gap={2} style={{ overflow: 'hidden', flex: 1 }}>
                            <Text fw={600} fz="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {op.description ?? `Операция #${op.id}`}
                            </Text>
                            <Group gap={4}>
                              {op.tags?.map((tag) => (
                                <Badge key={tag} size="xs" variant="dot" color={tagColor(tag)}>{tag}</Badge>
                              ))}
                              {account && (
                                <Badge size="sm" variant="outline" c="dimmed" color={accountTypeColors[account.type]}>
                                  {account.name}
                                </Badge>
                              )}
                              {op.recurrenceRuleId && <Text fz="xs" c="dimmed">🔁</Text>}
                            </Group>
                          </Stack>
                        </Group>
                        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                          <Stack gap={2} align="flex-end">
                            <Text fz="sm" fw={700} c={op.amount >= 0 ? 'green' : 'red'}>
                              {formatMoneyWithSign(op.amount, op.currency)}
                            </Text>
                            {op.currency !== baseCurrency && (
                              <Text fz="xs" c="dimmed">({formatMoney(op.amount, op.currency)})</Text>
                            )}
                          </Stack>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            title="Редактировать"
                            onClick={() => { setEditingOp(op); openForm(); }}
                          >
                            ✏️
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            title="Удалить"
                            onClick={() => handleDelete(op.id)}
                          >
                            🗑️
                          </ActionIcon>
                          {!op.isConfirmed && (
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              size="sm"
                              title="Подтвердить"
                              onClick={() => handleConfirm(op.id)}
                            >
                              ✓
                            </ActionIcon>
                          )}
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
        key={editingOp?.id ?? 'new'}
        opened={formOpened}
        onClose={closeForm}
        onSave={(op) => {
          if (editingOp) {
            useOperationStore.getState().updateOperation(op);
          } else {
            useOperationStore.getState().addOperation(op);
          }
        }}
        accounts={accounts}
        categories={categories}
        scenarios={scenarios}
        initialValues={editingOp}
      />
    </Stack>
  );
}
