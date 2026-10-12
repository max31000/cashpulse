import { useEffect, useState } from 'react';
import { Button, Group, SegmentedControl, Select, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { EmptyState, ErrorState, Page, Section } from '@mvv42/kit';
import { IconArrowsExchange, IconPlus, IconSearch } from '@tabler/icons-react';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { useDebounce } from '../hooks/useDebounce';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { OperationList } from '../components/OperationList/OperationList';
import { ListSkeleton } from '../components/RouterListRow';
import { confirmOperation, deleteOperation } from '../api/operations';
import type { PlannedOperation } from '../api/types';
import { getDateRange } from '../utils/formatDate';

type PeriodValue = 'week' | 'month' | 'quarter' | 'year' | 'all';
type TypeValue = 'all' | 'income' | 'expense';
type StatusValue = 'all' | 'confirmed' | 'planned';

export default function Operations() {
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { operations, loading, error: opError, fetch: fetchOps } = useOperationStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();
  const { scenarios, fetch: fetchScenarios } = useScenarioStore();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    const range = getDateRange(period);
    const isConfirmed = statusFilter === 'all' ? undefined : statusFilter === 'confirmed';
    void fetchOps({
      ...range,
      accountId: accountFilter ? Number(accountFilter) : undefined,
      categoryId: categoryFilter ? Number(categoryFilter) : undefined,
      isConfirmed,
      limit: 200,
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [period, statusFilter, accountFilter, categoryFilter]);

  const filtered = operations.filter((op) => {
    if (typeFilter === 'income' && op.amount <= 0) return false;
    if (typeFilter === 'expense' && op.amount >= 0) return false;
    if (debouncedSearch && !(op.description ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

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
  const openNew = () => {
    setEditingOp(undefined);
    openForm();
  };
  const resetFilters = () => {
    setPeriod('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setAccountFilter(null);
    setCategoryFilter(null);
    setSearchQuery('');
  };

  return (
    <Page
      title="Операции"
      description="Факт и план по всем счетам"
      width="wide"
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          Добавить операцию
        </Button>
      }
    >
      <Section padding="sm">
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
          <Select
            size="xs"
            placeholder="Все счета"
            aria-label="Счёт"
            data={activeAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
            value={accountFilter}
            onChange={setAccountFilter}
            clearable
            searchable
            w={{ base: '100%', xs: 170 }}
          />
          <Select
            size="xs"
            placeholder="Все категории"
            aria-label="Категория"
            data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={categoryFilter}
            onChange={setCategoryFilter}
            clearable
            searchable
            w={{ base: '100%', xs: 170 }}
          />
          <TextInput
            size="xs"
            placeholder="Поиск по описанию"
            aria-label="Поиск по описанию"
            leftSection={<IconSearch size={14} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            w={{ base: '100%', xs: 220 }}
          />
        </Group>
      </Section>

      <Section padding="none">
        {loading ? (
          <ListSkeleton rows={6} height={24} />
        ) : opError && operations.length === 0 ? (
          <ErrorState error={opError} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconArrowsExchange size={22} />}
            title="Нет операций за выбранный период"
            description="Создайте операцию или измените фильтры."
            action={
              <Group gap="xs" justify="center">
                <Button onClick={openNew}>Добавить операцию</Button>
                <Button variant="default" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              </Group>
            }
          />
        ) : (
          <OperationList
            operations={filtered}
            accounts={accounts}
            categories={categories}
            showAccount
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
    </Page>
  );
}
