import { useEffect, useState } from 'react';
import { Badge, Button, Group, Modal, Skeleton, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { EmptyState, Page, Section } from '@mvv42/kit';
import { IconGitBranch, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useScenarioStore } from '../store/useScenarioStore';
import { createScenario, updateScenario, deleteScenario, toggleScenario } from '../api/scenarios';
import type { Scenario, CreateScenarioDto } from '../api/types';


function ScenarioModal({ opened, onClose, onSave, initial }: {
  opened: boolean;
  onClose: () => void;
  onSave: (s: Scenario) => void;
  initial?: Scenario;
}) {
  const [loading, setLoading] = useState(false);
  const form = useForm<CreateScenarioDto>({
    initialValues: {
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      isActive: initial?.isActive ?? false,
    },
    validate: {
      name: (v) => !v?.trim() ? 'Введите название' : null,
    }
  });

  const handleSubmit = async (values: CreateScenarioDto) => {
    setLoading(true);
    try {
      const result = initial ? await updateScenario(initial.id, values) : await createScenario(values);
      onSave(result);
      onClose();
      notifications.show({ title: 'Успешно', message: initial ? 'Сценарий обновлён' : 'Сценарий создан', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={initial ? 'Редактировать сценарий' : 'Новый сценарий'} size="sm" closeOnClickOutside={false}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput label="Название" required maxLength={255} {...form.getInputProps('name')} />
          <Textarea label="Описание" autosize minRows={3} maxRows={6} {...form.getInputProps('description')} />
          <Switch label="Активировать сразу" {...form.getInputProps('isActive', { type: 'checkbox' })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={loading}>Отмена</Button>
            <Button type="submit" loading={loading}>Сохранить</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default function Scenarios() {
  const { scenarios, loading, fetch: fetchScenarios, addScenario, updateScenario: updateStore, removeScenario } = useScenarioStore();
  const [modalOpened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Scenario | undefined>();

  useEffect(() => { void fetchScenarios(); }, []);

  const handleToggle = async (s: Scenario) => {
    try {
      const result = await toggleScenario(s.id);
      updateStore(result);
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleDelete = async (s: Scenario) => {
    if (!confirm(`Удалить сценарий "${s.name}"?`)) return;
    try {
      await deleteScenario(s.id);
      removeScenario(s.id);
      notifications.show({ title: 'Удалено', message: 'Сценарий удалён', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const openNew = () => {
    setEditing(undefined);
    open();
  };

  return (
    <Page
      title="Сценарии"
      description="«Что если»: гипотетические доходы и расходы, которые можно включать в прогноз"
      actions={<Button leftSection={<IconPlus size={16} />} onClick={openNew}>Новый сценарий</Button>}
    >
      {loading ? (
        <Stack gap="md">
          {[1, 2].map((i) => <Skeleton key={i} h={120} />)}
        </Stack>
      ) : scenarios.length === 0 ? (
        <Section>
          <EmptyState
            icon={<IconGitBranch size={22} />}
            title="Нет сценариев"
            description="Создайте сценарий, чтобы сравнить варианты развития событий."
            action={<Button onClick={openNew}>Новый сценарий</Button>}
          />
        </Section>
      ) : (
        scenarios.map((s) => (
          <Section
            key={s.id}
            title={
              <Group gap="xs" component="span">
                <Link to={`/scenarios/${s.id}`} className="cp-title-link">{s.name}</Link>
                {s.isActive && <Badge size="sm" color="green">Активен</Badge>}
              </Group>
            }
            description={s.description || undefined}
            actions={<Switch aria-label={`Сценарий «${s.name}» активен`} checked={s.isActive} onChange={() => handleToggle(s)} />}
          >
            <Group gap="xs">
              <Button component={Link} to={`/scenarios/${s.id}`} variant="light" size="xs">Открыть</Button>
              <Button variant="subtle" size="xs" leftSection={<IconPencil size={14} />} onClick={() => { setEditing(s); open(); }}>
                Изменить
              </Button>
              <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={() => handleDelete(s)}>
                Удалить
              </Button>
            </Group>
          </Section>
        ))
      )}

      <ScenarioModal
        key={editing?.id ?? 'new'}
        opened={modalOpened}
        onClose={close}
        onSave={(s) => { if (editing) updateStore(s); else addScenario(s); }}
        initial={editing}
      />
    </Page>
  );
}
