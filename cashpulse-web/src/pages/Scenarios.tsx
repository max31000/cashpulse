import { useEffect, useState } from 'react';
import {
  Stack, Group, Button, Text, Card, Switch, Textarea, TextInput,
  Modal, Divider, Skeleton, Center
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
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
    <Modal opened={opened} onClose={onClose} title={initial ? 'Редактировать сценарий' : 'Новый сценарий'} size="sm" closeOnClickOutside={false} overlayProps={{ blur: 3 }}>
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
  const navigate = useNavigate();
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

  if (loading) {
    return (
      <Stack>
        <Group justify="space-between"><Text fz="xl" fw={700}>Сценарии</Text></Group>
        {[1,2,3].map(i => <Skeleton key={i} h={160} />)}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fz="xl" fw={700}>Сценарии</Text>
        <Button variant="filled" onClick={() => { setEditing(undefined); open(); }}>+ Новый сценарий</Button>
      </Group>

      {scenarios.length === 0 ? (
        <Center h={300}>
          <Stack align="center" gap="md">
            <Text fz="4xl">🔮</Text>
            <Text fw={600} fz="lg">Нет сценариев</Text>
            <Text c="dimmed" fz="sm">Создайте сценарий, чтобы сравнить варианты развития событий</Text>
            <Button onClick={() => { setEditing(undefined); open(); }}>+ Новый сценарий</Button>
          </Stack>
        </Center>
      ) : (
        <Stack gap="md">
          {scenarios.map((s) => (
            <Card key={s.id} p="lg" radius="md" withBorder shadow="sm">
              <Group justify="space-between" mb="sm">
                <Text fw={700} fz="lg">{s.name}</Text>
                <Switch
                  label="Активен"
                  checked={s.isActive}
                  onChange={() => handleToggle(s)}
                />
              </Group>
              {s.description && (
                <Text fz="sm" c="dimmed" lineClamp={3} mb="sm">{s.description}</Text>
              )}
              <Divider mb="sm" />
              <Card.Section withBorder inheritPadding pt="sm">
                <Group gap="xs">
                  <Button variant="subtle" size="xs" onClick={() => { setEditing(s); open(); }}>Редактировать</Button>
                  <Button variant="light" size="xs" onClick={() => navigate(`/scenarios/${s.id}`)}>Открыть</Button>
                  <Button variant="subtle" color="red" size="xs" onClick={() => handleDelete(s)}>Удалить</Button>
                </Group>
              </Card.Section>
            </Card>
          ))}
        </Stack>
      )}

      <ScenarioModal
        opened={modalOpened}
        onClose={close}
        onSave={(s) => { if (editing) updateStore(s); else addScenario(s); }}
        initial={editing}
      />
    </Stack>
  );
}
