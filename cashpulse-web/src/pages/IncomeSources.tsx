import { useEffect, useState } from 'react';
import { Badge, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { EmptyState, Page, Section } from '@mvv42/kit';
import { IconBolt, IconCash, IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
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

function trancheAmount(t: IncomeSource['tranches'][number], source: IncomeSource): string {
  if (t.amountMode === 'Fixed') return formatMoney(t.fixedAmount ?? 0, source.currency);
  if (t.amountMode === 'PercentOfTotal') return `${t.percentOfTotal}% от ${formatMoney(source.expectedTotal ?? 0, source.currency)}`;
  return `≈ ${formatMoney(t.fixedAmount ?? 0, source.currency)}`;
}

function IncomeSourceCard({ source, onEdit, onGenerate, onToggleActive }: IncomeSourceCardProps) {
  return (
    <Section
      title={
        <Group gap="xs" component="span">
          {source.name}
          <Badge size="sm" color={source.isActive ? 'green' : 'gray'}>
            {source.isActive ? 'Активен' : 'Неактивен'}
          </Badge>
        </Group>
      }
      description={`${source.currency} · траншей: ${source.tranches.length}`}
      actions={
        source.expectedTotal !== undefined && source.expectedTotal > 0 ? (
          <Text fz="lg" fw={600} className="mvv-num">
            {formatMoney(source.expectedTotal, source.currency)}
            <Text span fz="sm" c="dimmed" fw={400}> / мес</Text>
          </Text>
        ) : undefined
      }
    >
      <Stack gap={4}>
        {source.tranches.slice(0, 3).map((t) => (
          <Text key={t.id ?? t.name} fz="sm" c="dimmed">
            {t.name} — {t.dayOfMonth === -1 ? 'последний день' : `${t.dayOfMonth}-го`} · <span className="mvv-num">{trancheAmount(t, source)}</span>
          </Text>
        ))}
        {source.tranches.length > 3 && (
          <Text fz="sm" c="dimmed">и ещё {source.tranches.length - 3}</Text>
        )}
      </Stack>
      <Group gap="xs" mt="md">
        <Button variant="light" size="xs" leftSection={<IconBolt size={14} />} onClick={() => onGenerate(source)}>
          Сгенерировать операции
        </Button>
        <Button variant="subtle" size="xs" leftSection={<IconPencil size={14} />} onClick={() => onEdit(source)}>
          Изменить
        </Button>
        <Button
          variant="subtle"
          size="xs"
          color="gray"
          leftSection={source.isActive ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
          onClick={() => onToggleActive(source)}
        >
          {source.isActive ? 'Отключить' : 'Включить'}
        </Button>
      </Group>
    </Section>
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
    <Page
      title="Источники дохода"
      description="Зарплата, вклады, купоны и другие регулярные поступления с разбивкой по счетам"
      actions={<Button leftSection={<IconPlus size={16} />} onClick={handleAdd}>Источник дохода</Button>}
    >

      {loading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => <Skeleton key={i} h={120} radius="md" />)}
        </Stack>
      ) : sources.length === 0 ? (
        <Section>
          <EmptyState
            icon={<IconCash size={22} />}
            title="Нет источников дохода"
            description="Добавьте первый источник, чтобы отслеживать поступления и автоматически распределять их по счетам."
            action={<Button onClick={handleAdd}>Источник дохода</Button>}
          />
        </Section>
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
    </Page>
  );
}
