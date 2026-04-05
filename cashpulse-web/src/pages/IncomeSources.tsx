import { useEffect, useState } from 'react';
import {
  Stack, Title, Group, Button, Text, Card, Badge, Skeleton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useIncomeSourceStore } from '../store/useIncomeSourceStore';
import { useAccountStore } from '../store/useAccountStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { toggleIncomeSourceActive } from '../api/incomeSources';
import type { IncomeSource } from '../api/types';
import { formatMoney } from '../utils/formatMoney';
import { IncomeSourceFormModal } from '../components/IncomeSourceForm/IncomeSourceFormModal';
import { GenerateOperationsModal } from '../components/IncomeSourceForm/GenerateOperationsModal';

// ─── Card component ──────────────────────────────────────────────────────────

interface IncomeSourceCardProps {
  source: IncomeSource;
  onEdit: (s: IncomeSource) => void;
  onGenerate: (s: IncomeSource) => void;
  onToggleActive: (s: IncomeSource) => void;
}

function IncomeSourceCard({ source, onEdit, onGenerate, onToggleActive }: IncomeSourceCardProps) {
  return (
    <Card withBorder p="lg" radius="md" shadow="sm">
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={700} fz="lg">{source.name}</Text>
            <Badge
              size="sm"
              color={source.isActive ? 'green' : 'gray'}
              variant="light"
            >
              {source.isActive ? 'Активен' : 'Неактивен'}
            </Badge>
          </Group>
          {source.expectedTotal !== undefined && source.expectedTotal > 0 && (
            <Text fz="xl" fw={700} c="green">
              {formatMoney(source.expectedTotal, source.currency)} / мес
            </Text>
          )}
        </Group>
      </Card.Section>

      <Stack gap={4} mt="sm">
        <Group gap="md">
          <Group gap={4}>
            <Text fz="xs" c="dimmed">Валюта:</Text>
            <Badge size="xs" variant="outline">{source.currency}</Badge>
          </Group>
          <Group gap={4}>
            <Text fz="xs" c="dimmed">Траншей:</Text>
            <Text fz="xs" fw={600}>{source.tranches.length}</Text>
          </Group>
        </Group>

        {source.tranches.slice(0, 2).map((t) => (
          <Text key={t.id ?? t.name} fz="xs" c="dimmed">
            · {t.name} — {t.dayOfMonth === -1 ? 'последний день' : `${t.dayOfMonth}-го`}
            {' '}({t.amountMode === 'Fixed'
              ? formatMoney(t.fixedAmount ?? 0, source.currency)
              : t.amountMode === 'PercentOfTotal'
              ? `${t.percentOfTotal}% от ${formatMoney(source.expectedTotal ?? 0, source.currency)}`
              : `≈ ${formatMoney(t.fixedAmount ?? 0, source.currency)}`
            })
          </Text>
        ))}
        {source.tranches.length > 2 && (
          <Text fz="xs" c="dimmed">+ ещё {source.tranches.length - 2} транша</Text>
        )}
      </Stack>

      <Card.Section withBorder inheritPadding pt="sm" mt="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Button
              variant="subtle"
              size="xs"
              onClick={(e) => { e.stopPropagation(); onEdit(source); }}
            >
              ✏️ Редактировать
            </Button>
            <Button
              variant="subtle"
              size="xs"
              color={source.isActive ? 'gray' : 'green'}
              onClick={(e) => { e.stopPropagation(); onToggleActive(source); }}
            >
              {source.isActive ? '⏸ Деактивировать' : '▶ Активировать'}
            </Button>
          </Group>
          <Button
            variant="light"
            size="xs"
            color="blue"
            onClick={(e) => { e.stopPropagation(); onGenerate(source); }}
          >
            ⚡ Сгенерировать операции
          </Button>
        </Group>
      </Card.Section>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IncomeSources() {
  const { sources, loading, fetch } = useIncomeSourceStore();
  const { accounts, fetch: fetchAccounts } = useAccountStore();
  const { categories, fetch: fetchCategories } = useCategoryStore();

  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [generateOpened, { open: openGenerate, close: closeGenerate }] = useDisclosure(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | undefined>();
  const [generatingSource, setGeneratingSource] = useState<IncomeSource | undefined>();

  useEffect(() => {
    void fetch();
    void fetchAccounts();
    void fetchCategories();
  }, []);

  const handleEdit = (s: IncomeSource) => { setEditingSource(s); openForm(); };
  const handleAdd = () => { setEditingSource(undefined); openForm(); };
  const handleGenerate = (s: IncomeSource) => { setGeneratingSource(s); openGenerate(); };

  const handleToggleActive = async (s: IncomeSource) => {
    try {
      const updated = await toggleIncomeSourceActive(s.id, !s.isActive);
      useIncomeSourceStore.getState().updateSource(updated);
      notifications.show({
        title: updated.isActive ? 'Активирован' : 'Деактивирован',
        message: `"${updated.name}" обновлён`,
        color: 'green',
      });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Источники дохода</Title>
        <Button variant="filled" onClick={handleAdd}>+ Источник дохода</Button>
      </Group>
      <Text c="dimmed" fz="sm">
        Зарплата, вклады, купоны и другие регулярные поступления с разбивкой по счетам.
      </Text>

      {loading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => <Skeleton key={i} h={120} radius="md" />)}
        </Stack>
      ) : sources.length === 0 ? (
        <Stack align="center" py="xl" gap="sm">
          <Text fz="4xl">💵</Text>
          <Text fw={600}>Нет источников дохода</Text>
          <Text c="dimmed" fz="sm" ta="center" maw={320}>
            Добавьте первый источник, чтобы отслеживать поступления и автоматически
            распределять их по счетам
          </Text>
          <Button onClick={handleAdd}>+ Источник дохода</Button>
        </Stack>
      ) : (
        <Stack gap="sm">
          {sources.map((s) => (
            <IncomeSourceCard
              key={s.id}
              source={s}
              onEdit={handleEdit}
              onGenerate={handleGenerate}
              onToggleActive={handleToggleActive}
            />
          ))}
        </Stack>
      )}

      <IncomeSourceFormModal
        key={editingSource?.id ?? 'new'}
        opened={formOpened}
        onClose={closeForm}
        initial={editingSource}
        accounts={accounts}
        categories={categories}
        onSave={(saved) => {
          if (editingSource) useIncomeSourceStore.getState().updateSource(saved);
          else useIncomeSourceStore.getState().addSource(saved);
        }}
      />

      {generatingSource && (
        <GenerateOperationsModal
          opened={generateOpened}
          onClose={closeGenerate}
          source={generatingSource}
          accounts={accounts}
        />
      )}
    </Stack>
  );
}
