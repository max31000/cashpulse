import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Group, Skeleton, Switch } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { EmptyState, Page, Section } from '@mvv42/kit';
import { IconGitBranch, IconPlus } from '@tabler/icons-react';
import { useScenarioStore } from '../store/useScenarioStore';
import { useAccountStore } from '../store/useAccountStore';
import { useOperationStore } from '../store/useOperationStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { OperationForm } from '../components/OperationForm/OperationForm';
import { OperationList } from '../components/OperationList/OperationList';
import { ListSkeleton } from '../components/RouterListRow';
import { toggleScenario } from '../api/scenarios';
import { confirmOperation, deleteOperation } from '../api/operations';
import type { PlannedOperation } from '../api/types';

export default function ScenarioDetail() {
  const { id } = useParams<{ id: string }>();
  const { scenarios, loading: scLoading, fetch: fetchScenarios, updateScenario } = useScenarioStore();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    void fetchOps({ scenarioId: Number(id), limit: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!scenario) {
    return (
      <Page>
        {scLoading || scenarios.length === 0 ? (
          <Skeleton h={160} />
        ) : (
          <EmptyState
            title="Сценарий не найден"
            action={<Button component={Link} to="/scenarios" variant="default">Все сценарии</Button>}
          />
        )}
      </Page>
    );
  }

  const handleToggle = async () => {
    try {
      updateScenario(await toggleScenario(scenario.id));
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

  const openNew = () => {
    setEditingOp(undefined);
    openForm();
  };

  return (
    <Page
      eyebrow={<Link to="/scenarios" className="mvv-link">← Сценарии</Link>}
      title={scenario.name}
      description={scenario.description || undefined}
      width="wide"
      actions={
        <Group gap="md">
          <Switch label="Активен" checked={scenario.isActive} onChange={() => handleToggle()} />
          <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
            Добавить операцию
          </Button>
        </Group>
      }
    >
      <Section title="Операции сценария" description="Учитываются в прогнозе, пока сценарий активен" padding="none">
        {opLoading ? (
          <ListSkeleton rows={3} height={24} />
        ) : operations.length === 0 ? (
          <EmptyState
            compact
            icon={<IconGitBranch size={22} />}
            title="В сценарии пока нет операций"
            description="Добавьте гипотетические доходы и расходы — прогноз покажет, что изменится."
            action={<Button onClick={openNew}>Добавить операцию</Button>}
          />
        ) : (
          <OperationList
            operations={operations}
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
          if (editingOp) useOperationStore.getState().updateOperation(op);
          else useOperationStore.getState().addOperation(op);
        }}
        accounts={accounts}
        categories={categories}
        scenarios={scenarios}
        initialValues={editingOp}
        fixedScenarioId={scenario.id}
      />
    </Page>
  );
}
