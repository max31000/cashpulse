import { useEffect, useState } from 'react';
import {
  Tabs, Stack, TextInput, Select, SegmentedControl, Button, Group,
  Text, Table, NumberInput, Badge, ActionIcon, Divider, Alert, Skeleton
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useForm } from '@mantine/form';
import { useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useSettingsStore } from '../store/useSettingsStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useAccountStore } from '../store/useAccountStore';
import { getExchangeRates, refreshExchangeRates } from '../api/exchangeRates';
import { previewImport, importCsv } from '../api/import';
import { deleteCategory } from '../api/categories';
import type { ExchangeRate, Category, ImportPreviewResponse } from '../api/types';
import { formatDateCompact } from '../utils/formatDate';

export default function Settings() {
  const { colorScheme, baseCurrency, displayName, email, setColorScheme, setBaseCurrency, setDisplayName } = useSettingsStore();
  const { setColorScheme: setMantineScheme } = useMantineColorScheme();
  const { categories, fetch: fetchCategories, removeCategory } = useCategoryStore();
  const { accounts } = useAccountStore();

  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const profileForm = useForm({
    initialValues: { displayName, baseCurrency },
  });

  useEffect(() => {
    void fetchCategories();
    void loadRates();
  }, []);

  const loadRates = async () => {
    setRatesLoading(true);
    try {
      const data = await getExchangeRates();
      setRates(data);
    } catch {
      // ignore
    } finally {
      setRatesLoading(false);
    }
  };

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

  const handleSaveProfile = (values: { displayName: string; baseCurrency: string }) => {
    setDisplayName(values.displayName);
    setBaseCurrency(values.baseCurrency);
    notifications.show({ title: 'Сохранено', message: 'Настройки профиля сохранены', color: 'green' });
  };

  const handleFileSelect = async (files: File[]) => {
    if (!files[0]) return;
    setImportFile(files[0]);
    try {
      const result = await previewImport(files[0]);
      setPreview(result);
      // Auto-map
      const autoMapping: Record<string, string> = {};
      const modelFields = ['date', 'amount', 'currency', 'description', 'category', 'tags'];
      modelFields.forEach((field) => {
        const match = result.headers.find((h) => h.toLowerCase().includes(field.toLowerCase()));
        if (match) autoMapping[field] = match;
      });
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
  const childCategories = categories.filter((c) => !!c.parentId);

  const freshThreshold = 24 * 60 * 60 * 1000;

  return (
    <Stack gap="md">
      <Text fz="xl" fw={700}>Настройки</Text>
      <Tabs defaultValue="profile">
        <Tabs.List>
          <Tabs.Tab value="profile">Профиль</Tabs.Tab>
          <Tabs.Tab value="categories">Категории</Tabs.Tab>
          <Tabs.Tab value="rates">Курсы валют</Tabs.Tab>
          <Tabs.Tab value="import">Импорт CSV</Tabs.Tab>
        </Tabs.List>

        {/* Profile Tab */}
        <Tabs.Panel value="profile" pt="md">
          <form onSubmit={profileForm.onSubmit(handleSaveProfile)}>
            <Stack gap="md" maw={480}>
              <TextInput label="Email" readOnly value={email} c="dimmed" />
              <TextInput label="Отображаемое имя" maxLength={255} {...profileForm.getInputProps('displayName')} />
              <Select
                label="Базовая валюта"
                data={['RUB', 'USD', 'EUR', 'CNY', 'GBP']}
                description="Все суммы будут пересчитываться в эту валюту"
                {...profileForm.getInputProps('baseCurrency')}
              />
              <div>
                <Text fz="sm" fw={500} mb={6}>Тема оформления</Text>
                <SegmentedControl
                  value={colorScheme}
                  onChange={(v) => {
                    const scheme = v as 'auto' | 'light' | 'dark';
                    setColorScheme(scheme);
                    setMantineScheme(scheme);
                  }}
                  data={[
                    { label: 'Авто', value: 'auto' },
                    { label: 'Светлая', value: 'light' },
                    { label: 'Тёмная', value: 'dark' },
                  ]}
                />
              </div>
              <Group justify="flex-end">
                <Button type="submit" variant="filled">Сохранить</Button>
              </Group>
            </Stack>
          </form>
        </Tabs.Panel>

        {/* Categories Tab */}
        <Tabs.Panel value="categories" pt="md">
          <Stack gap="md">
            <Group justify="flex-end">
              <Button size="xs" variant="filled">+ Добавить</Button>
            </Group>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Название</Table.Th>
                  <Table.Th>Иконка</Table.Th>
                  <Table.Th>Цвет</Table.Th>
                  <Table.Th>Действия</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rootCategories.map((cat) => (
                  <>
                    <Table.Tr key={cat.id}>
                      <Table.Td>
                        <Group gap="xs">
                          <Text>▶</Text>
                          <Text fw={600}>{cat.name}</Text>
                          {cat.isSystem && <Badge size="xs" variant="outline" color="gray">system</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td>{cat.icon ?? '—'}</Table.Td>
                      <Table.Td>
                        {cat.color ? <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: cat.color }} /> : '—'}
                      </Table.Td>
                      <Table.Td>
                        {cat.isSystem ? (
                          <Text fz="xs" c="dimmed" title="Системная категория не удаляется">🔒</Text>
                        ) : (
                          <Group gap="xs">
                            <ActionIcon size="sm" variant="subtle">✏️</ActionIcon>
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteCategory(cat)}>🗑️</ActionIcon>
                          </Group>
                        )}
                      </Table.Td>
                    </Table.Tr>
                    {childCategories.filter(c => c.parentId === cat.id).map(child => (
                      <Table.Tr key={child.id}>
                        <Table.Td pl="xl">
                          <Group gap="xs">
                            <Text c="dimmed">└</Text>
                            <Text>{child.name}</Text>
                            {child.isSystem && <Badge size="xs" variant="outline" color="gray">system</Badge>}
                          </Group>
                        </Table.Td>
                        <Table.Td>{child.icon ?? '—'}</Table.Td>
                        <Table.Td>
                          {child.color ? <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: child.color }} /> : '—'}
                        </Table.Td>
                        <Table.Td>
                          {child.isSystem ? (
                            <Text fz="xs" c="dimmed">🔒</Text>
                          ) : (
                            <Group gap="xs">
                              <ActionIcon size="sm" variant="subtle">✏️</ActionIcon>
                              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteCategory(child)}>🗑️</ActionIcon>
                            </Group>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>

        {/* Exchange Rates Tab */}
        <Tabs.Panel value="rates" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">Курсы валют к базовой валюте</Text>
              <Group>
                {rates.length > 0 && (() => {
                  const latest = rates.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b);
                  const isFresh = Date.now() - new Date(latest.updatedAt).getTime() < freshThreshold;
                  return (
                    <Badge color={isFresh ? 'green' : 'red'} variant="outline" size="sm">
                      {isFresh ? '● Актуально' : '● Устарело'}
                    </Badge>
                  );
                })()}
                <Button
                  variant="outline"
                  size="xs"
                  loading={refreshLoading}
                  onClick={handleRefreshRates}
                >
                  ↺ Обновить из ЦБ РФ
                </Button>
              </Group>
            </Group>
            {ratesLoading ? (
              <Stack gap="xs">{[1,2,3].map(i => <Skeleton key={i} h={40} />)}</Stack>
            ) : rates.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">Нет данных о курсах</Text>
            ) : (
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Валюта</Table.Th>
                    <Table.Th>Курс</Table.Th>
                    <Table.Th>Обновлено</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rates.map((r) => (
                    <Table.Tr key={`${r.fromCurrency}-${r.toCurrency}`}>
                      <Table.Td fw={600}>{r.fromCurrency}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          value={r.rate}
                          decimalScale={6}
                          step={0.01}
                          rightSection="₽"
                          size="xs"
                          w={150}
                          readOnly
                        />
                      </Table.Td>
                      <Table.Td fz="xs" c="dimmed">{formatDateCompact(r.updatedAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>

        {/* Import CSV Tab */}
        <Tabs.Panel value="import" pt="md">
          <Stack gap="md" maw={700}>
            {!importFile ? (
              <Dropzone
                onDrop={handleFileSelect}
                accept={['text/csv', 'application/vnd.ms-excel']}
                maxSize={5 * 1024 * 1024}
              >
                <Stack align="center" gap="xs" py="xl">
                  <Text fz="2xl">📁</Text>
                  <Text fw={500}>Перетащите CSV-файл сюда или нажмите для выбора</Text>
                  <Text fz="xs" c="dimmed">Формат: .csv, UTF-8 или Windows-1251, макс. 5 МБ</Text>
                </Stack>
              </Dropzone>
            ) : (
              <Group>
                <Text fz="sm">{importFile.name}</Text>
                <Button size="xs" variant="subtle" color="red" onClick={() => { setImportFile(null); setPreview(null); setImportResult(null); }}>
                  × Удалить
                </Button>
              </Group>
            )}

            {preview && (
              <>
                <Text fz="sm" fw={500}>Превью (первые {Math.min(5, preview.preview.length)} строк):</Text>
                <div style={{ overflowX: 'auto' }}>
                  <Table fz="xs" withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        {preview.headers.map((h) => <Table.Th key={h}>{h}</Table.Th>)}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {preview.preview.slice(0, 5).map((row: string[], i: number) => (
                        <Table.Tr key={i}>
                          {row.map((cell: string, j: number) => <Table.Td key={j}>{cell}</Table.Td>)}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>

                <Divider label="Маппинг колонок" />
                {[
                  { field: 'date', label: 'Дата операции', required: true },
                  { field: 'amount', label: 'Сумма', required: true },
                  { field: 'currency', label: 'Валюта', required: false },
                  { field: 'description', label: 'Описание', required: false },
                  { field: 'category', label: 'Категория', required: false },
                  { field: 'tags', label: 'Теги', required: false },
                ].map(({ field, label, required }) => (
                  <Group key={field} justify="space-between">
                    <Text fz="sm">{label}{required && ' *'}</Text>
                    <Select
                      size="xs"
                      w={200}
                      value={mapping[field] ?? ''}
                      onChange={(v) => setMapping({ ...mapping, [field]: v ?? '' })}
                      data={[
                        { value: '', label: '(не импортировать)' },
                        ...preview.headers.map((h) => ({ value: h, label: h })),
                      ]}
                    />
                  </Group>
                ))}

                <Group justify="flex-end">
                  <Button
                    variant="filled"
                    disabled={!mapping['date'] || !mapping['amount'] || importLoading}
                    loading={importLoading}
                    onClick={handleImport}
                  >
                    Импортировать
                  </Button>
                </Group>
              </>
            )}

            {importResult && (
              <Alert color={importResult.skipped > 0 ? 'yellow' : 'green'} title="Импорт завершён">
                <Text fz="sm">Импортировано: {importResult.imported} операций</Text>
                {importResult.skipped > 0 && (
                  <Text fz="sm">Пропущено: {importResult.skipped} (дублирование / ошибка)</Text>
                )}
                <Button size="xs" variant="subtle" mt="xs" onClick={() => window.location.href = '/cashpulse/operations'}>
                  Перейти к операциям
                </Button>
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
