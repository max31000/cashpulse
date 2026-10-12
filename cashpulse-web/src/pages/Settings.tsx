import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon, Alert, Badge, Button, Group, Select, Skeleton, Stack, Table, Tabs, Text, Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { EmptyState, Page, Section, UserAvatar } from '@mvv42/kit';
import { useMe } from '@mvv42/kit/platform';
import { IconFileUpload, IconLock, IconPencil, IconRefresh, IconTrash, IconX } from '@tabler/icons-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useAccountStore } from '../store/useAccountStore';
import { getExchangeRates, refreshExchangeRates } from '../api/exchangeRates';
import { previewImport, importCsv } from '../api/import';
import { deleteCategory } from '../api/categories';
import type { ExchangeRate, Category, ImportPreviewResponse } from '../api/types';
import { formatDateCompact } from '../utils/formatDate';

const FRESH_MS = 24 * 60 * 60 * 1000;

const IMPORT_FIELDS = [
  { field: 'date', label: 'Дата операции', required: true },
  { field: 'amount', label: 'Сумма', required: true },
  { field: 'currency', label: 'Валюта', required: false },
  { field: 'description', label: 'Описание', required: false },
  { field: 'category', label: 'Категория', required: false },
  { field: 'tags', label: 'Теги', required: false },
];

function CategoryRow({ cat, child, onDelete }: { cat: Category; child?: boolean; onDelete: (c: Category) => void }) {
  return (
    <Table.Tr>
      <Table.Td pl={child ? 'xl' : undefined}>
        <Group gap="xs" wrap="nowrap">
          <Text fz="sm" fw={child ? 400 : 600}>{cat.name}</Text>
          {cat.isSystem && <Badge size="xs" color="gray">системная</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>{cat.icon ?? <Text span c="dimmed">—</Text>}</Table.Td>
      <Table.Td>{cat.color ? <span className="cp-swatch" style={{ background: cat.color }} /> : <Text span c="dimmed">—</Text>}</Table.Td>
      <Table.Td ta="right">
        {cat.isSystem ? (
          <Tooltip label="Системная категория не удаляется">
            <IconLock size={16} className="cp-muted-icon" aria-label="Системная категория" />
          </Tooltip>
        ) : (
          <Group gap={2} justify="flex-end" wrap="nowrap">
            <ActionIcon aria-label="Изменить"><IconPencil size={16} /></ActionIcon>
            <ActionIcon aria-label="Удалить" onClick={() => onDelete(cat)}><IconTrash size={16} /></ActionIcon>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { baseCurrency, setBaseCurrency } = useSettingsStore();
  const { user } = useMe();
  const { categories, loading: catLoading, fetch: fetchCategories, removeCategory } = useCategoryStore();
  const { accounts } = useAccountStore();

  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const profileForm = useForm({ initialValues: { baseCurrency } });

  const loadRates = async () => {
    setRatesLoading(true);
    try {
      setRates(await getExchangeRates());
    } catch {
      // shown as the empty state
    } finally {
      setRatesLoading(false);
    }
  };

  useEffect(() => {
    void fetchCategories();
    void loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefreshRates = async () => {
    setRefreshLoading(true);
    try {
      const data = await refreshExchangeRates();
      setRates(data.rates);
      notifications.show({ title: 'Успешно', message: 'Курсы обновлены из ЦБ РФ', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleSaveProfile = (values: { baseCurrency: string }) => {
    setBaseCurrency(values.baseCurrency);
    notifications.show({ title: 'Сохранено', message: 'Настройки сохранены', color: 'green' });
  };

  const handleFileSelect = async (files: File[]) => {
    if (!files[0]) return;
    setImportFile(files[0]);
    try {
      const result = await previewImport(files[0]);
      setPreview(result);
      const autoMapping: Record<string, string> = {};
      for (const { field } of IMPORT_FIELDS) {
        const match = result.headers.find((h) => h.toLowerCase().includes(field));
        if (match) autoMapping[field] = match;
      }
      setMapping(autoMapping);
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const handleImport = async () => {
    if (!importFile || !accounts[0]) return;
    setImportLoading(true);
    try {
      const result = await importCsv(importFile, mapping, accounts[0].id);
      setImportResult({ imported: result.imported, skipped: 0 });
      notifications.show({ title: 'Импорт завершён', message: `Импортировано: ${result.imported}`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setPreview(null);
    setImportResult(null);
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (cat.isSystem) return;
    if (!confirm(`Удалить категорию "${cat.name}"?`)) return;
    try {
      await deleteCategory(cat.id);
      removeCategory(cat.id);
      notifications.show({ title: 'Удалено', message: 'Категория удалена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  const rootCategories = categories.filter((c) => !c.parentId);
  const latestRate = rates.length > 0 ? rates.reduce((a, b) => (new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b)) : null;
  const ratesFresh = latestRate ? Date.now() - new Date(latestRate.updatedAt).getTime() < FRESH_MS : false;

  return (
    <Page title="Настройки">
      <Tabs defaultValue="profile">
        <Tabs.List mb="lg">
          <Tabs.Tab value="profile">Профиль</Tabs.Tab>
          <Tabs.Tab value="categories">Категории</Tabs.Tab>
          <Tabs.Tab value="rates">Курсы валют</Tabs.Tab>
          <Tabs.Tab value="import">Импорт CSV</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile">
          <Stack gap="lg">
            <Section title="Аккаунт" description="Вход и профиль общие для всех сервисов mvv42 — управляются на mvv42.ru">
              {user ? (
                <Group gap="md" wrap="nowrap">
                  <UserAvatar user={user} size={44} />
                  <div className="cp-truncate">
                    <Text fw={600}>{user.name}</Text>
                    <Text fz="sm" c="dimmed">{user.username ? `@${user.username} · ` : ''}Telegram</Text>
                  </div>
                </Group>
              ) : (
                <Skeleton h={44} />
              )}
            </Section>
            <Section title="Валюта" description="Все суммы на дашборде и в прогнозе пересчитываются в эту валюту">
              <form onSubmit={profileForm.onSubmit(handleSaveProfile)}>
                <Group align="flex-end" gap="sm">
                  <Select label="Базовая валюта" data={['RUB', 'USD', 'EUR', 'CNY', 'GBP']} w={200} {...profileForm.getInputProps('baseCurrency')} />
                  <Button type="submit">Сохранить</Button>
                </Group>
              </form>
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="categories">
          <Section title="Категории" description="Системные категории создаются автоматически" padding="none">
            {catLoading ? (
              <Stack p="md" gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={32} />)}</Stack>
            ) : rootCategories.length === 0 ? (
              <EmptyState compact title="Категорий нет" />
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Название</Table.Th>
                    <Table.Th>Иконка</Table.Th>
                    <Table.Th>Цвет</Table.Th>
                    <Table.Th ta="right">Действия</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rootCategories.map((cat) => (
                    <Fragment key={cat.id}>
                      <CategoryRow cat={cat} onDelete={handleDeleteCategory} />
                      {categories.filter((c) => c.parentId === cat.id).map((child) => (
                        <CategoryRow key={child.id} cat={child} child onDelete={handleDeleteCategory} />
                      ))}
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Section>
        </Tabs.Panel>

        <Tabs.Panel value="rates">
          <Section
            title="Курсы валют"
            description="К базовой валюте, по данным ЦБ РФ"
            padding="none"
            actions={
              <>
                {latestRate && (
                  <Badge color={ratesFresh ? 'green' : 'red'}>{ratesFresh ? 'Актуально' : 'Устарело'}</Badge>
                )}
                <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} loading={refreshLoading} onClick={handleRefreshRates}>
                  Обновить из ЦБ РФ
                </Button>
              </>
            }
          >
            {ratesLoading ? (
              <Stack p="md" gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={32} />)}</Stack>
            ) : rates.length === 0 ? (
              <EmptyState compact title="Нет данных о курсах" description="Нажмите «Обновить из ЦБ РФ»." />
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Валюта</Table.Th>
                    <Table.Th ta="right">Курс</Table.Th>
                    <Table.Th ta="right">Обновлено</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rates.map((r) => (
                    <Table.Tr key={`${r.fromCurrency}-${r.toCurrency}`}>
                      <Table.Td fw={600}>{r.fromCurrency}</Table.Td>
                      <Table.Td ta="right">{r.rate.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₽</Table.Td>
                      <Table.Td ta="right" c="dimmed">{formatDateCompact(r.updatedAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Section>
        </Tabs.Panel>

        <Tabs.Panel value="import">
          <Section title="Импорт CSV" description={accounts[0] ? `Операции попадут на счёт «${accounts[0].name}»` : 'Сначала создайте счёт'}>
            <Stack gap="md">
              {!importFile ? (
                <Dropzone onDrop={handleFileSelect} accept={['text/csv', 'application/vnd.ms-excel']} maxSize={5 * 1024 * 1024}>
                  <Stack align="center" gap={6} py="xl">
                    <IconFileUpload size={32} stroke={1.5} className="cp-muted-icon" />
                    <Text fw={500}>Перетащите CSV-файл сюда или нажмите для выбора</Text>
                    <Text fz="xs" c="dimmed">.csv, UTF-8 или Windows-1251, до 5 МБ</Text>
                  </Stack>
                </Dropzone>
              ) : (
                <Group gap="xs">
                  <Text fz="sm" fw={500}>{importFile.name}</Text>
                  <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconX size={12} />} onClick={resetImport}>
                    Убрать
                  </Button>
                </Group>
              )}

              {preview && (
                <>
                  <Text fz="sm" fw={500}>Первые {Math.min(5, preview.preview.length)} строк</Text>
                  <Table.ScrollContainer minWidth={480}>
                    <Table fz="xs" withTableBorder>
                      <Table.Thead>
                        <Table.Tr>{preview.headers.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.preview.slice(0, 5).map((row, i) => (
                          <Table.Tr key={i}>{row.map((cell, j) => <Table.Td key={j}>{cell}</Table.Td>)}</Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>

                  <Text fz="sm" fw={500}>Колонки</Text>
                  {IMPORT_FIELDS.map(({ field, label, required }) => (
                    <Group key={field} justify="space-between">
                      <Text fz="sm">{label}{required && ' *'}</Text>
                      <Select
                        size="xs"
                        w={200}
                        aria-label={label}
                        value={mapping[field] ?? ''}
                        onChange={(v) => setMapping({ ...mapping, [field]: v ?? '' })}
                        data={[{ value: '', label: '(не импортировать)' }, ...preview.headers.map((h) => ({ value: h, label: h }))]}
                      />
                    </Group>
                  ))}

                  <Group justify="flex-end">
                    <Button disabled={!mapping['date'] || !mapping['amount'] || importLoading} loading={importLoading} onClick={handleImport}>
                      Импортировать
                    </Button>
                  </Group>
                </>
              )}

              {importResult && (
                <Alert color={importResult.skipped > 0 ? 'yellow' : 'green'} title="Импорт завершён">
                  <Text fz="sm">Импортировано: {importResult.imported} операций</Text>
                  {importResult.skipped > 0 && <Text fz="sm">Пропущено: {importResult.skipped} (дублирование / ошибка)</Text>}
                  <Button size="xs" variant="subtle" mt="xs" px={0} onClick={() => navigate('/operations')}>
                    Перейти к операциям
                  </Button>
                </Alert>
              )}
            </Stack>
          </Section>
        </Tabs.Panel>
      </Tabs>
    </Page>
  );
}
