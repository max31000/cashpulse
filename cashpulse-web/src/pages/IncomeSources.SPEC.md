# UX-спецификация: Источники дохода (Income Sources)

> CashPulse · React 19 + Mantine v9 + Zustand  
> Маршрут: `/cashpulse/income-sources`  
> Дата: апрель 2026

---

## Содержание

1. [Типы и стор](#1-типы-и-стор)
2. [Экран 1: Список источников дохода](#2-экран-1-список-источников-дохода)
3. [Экран 2: Форма создания/редактирования](#3-экран-2-форма-создания--редактирования)
4. [Экран 3: Модал «Сгенерировать операции»](#4-экран-3-модал-сгенерировать-операции)
5. [Экран 4: Модал «Подтвердить транш»](#5-экран-4-модал-подтвердить-транш)
6. [Экран 5: Виджет на AccountDetail](#6-экран-5-виджет-на-accountdetail)
7. [Утилиты вычислений](#7-утилиты-вычислений)

---

## 1. Типы и стор

### 1.1 Типы (добавить в `src/api/types.ts`)

```typescript
// Режим суммы транша
export type AmountMode = 'Fixed' | 'PercentOfTotal' | 'Estimated';

// Режим распределения на счёт
export type DistributionValueMode = 'Percent' | 'FixedAmount' | 'Remainder';

// Правило распределения на один счёт
export interface DistributionRule {
  id?: number;
  accountId: number;
  valueMode: DistributionValueMode;
  percent?: number;       // когда valueMode === 'Percent'
  fixedAmount?: number;   // когда valueMode === 'FixedAmount'
  delayDays: number;      // 0 по умолчанию
  categoryId?: number;    // тег/категория создаваемой операции
}

// Транш
export interface IncomeTranche {
  id?: number;
  name: string;
  dayOfMonth: number;           // 1–31, -1 = последний день месяца
  amountMode: AmountMode;
  fixedAmount?: number;         // когда amountMode === 'Fixed' | 'Estimated'
  percentOfTotal?: number;      // когда amountMode === 'PercentOfTotal'
  distributionRules: DistributionRule[];
}

// Источник дохода
export interface IncomeSource {
  id: number;
  name: string;
  currency: string;
  expectedTotal: number;        // общая плановая сумма / мес
  isActive: boolean;
  tranches: IncomeTranche[];
  createdAt: string;
  updatedAt: string;
}

// DTO для создания
export interface CreateIncomeSourceDto {
  name: string;
  currency: string;
  expectedTotal: number;
  isActive?: boolean;
  tranches: Omit<IncomeTranche, 'id'>[];
}
```

### 1.2 Стор (`src/store/useIncomeSourceStore.ts`)

```typescript
import { create } from 'zustand';
import type { IncomeSource } from '../api/types';

interface IncomeSourceStore {
  sources: IncomeSource[];
  loading: boolean;
  fetch: () => Promise<void>;
  addSource: (s: IncomeSource) => void;
  updateSource: (s: IncomeSource) => void;
  removeSource: (id: number) => void;
}

export const useIncomeSourceStore = create<IncomeSourceStore>((set) => ({
  sources: [],
  loading: false,
  fetch: async () => {
    set({ loading: true });
    try {
      const data = await fetchIncomeSources(); // API call
      set({ sources: data });
    } finally {
      set({ loading: false });
    }
  },
  addSource: (s) => set((st) => ({ sources: [...st.sources, s] })),
  updateSource: (s) => set((st) => ({ sources: st.sources.map((x) => x.id === s.id ? s : x) })),
  removeSource: (id) => set((st) => ({ sources: st.sources.filter((x) => x.id !== id) })),
}));
```

---

## 2. Экран 1: Список источников дохода

**Файл:** `src/pages/IncomeSources.tsx`

### 2.1 Layout

```
<Stack gap="md">
  ┌─ Header ────────────────────────────────────────┐
  │  <Group justify="space-between">                │
  │    <Title order={2}>Источники дохода</Title>    │
  │    <Button>+ Источник дохода</Button>           │
  │  </Group>                                       │
  └─────────────────────────────────────────────────┘
  ┌─ Subtitle ──────────────────────────────────────┐
  │  <Text c="dimmed" fz="sm">                     │
  │    Зарплата, вклады, купоны — регулярные...    │
  │  </Text>                                        │
  └─────────────────────────────────────────────────┘
  ┌─ Loading skeleton ──────────────────────────────┐
  │  {loading && [1,2,3].map(i => <Skeleton h={90}/>}│
  └─────────────────────────────────────────────────┘
  ┌─ Empty state ───────────────────────────────────┐
  │  {!loading && sources.length === 0 && (         │
  │    <Stack align="center" py="xl">              │
  │      <Text fz="4xl">💵</Text>                  │
  │      <Text fw={600}>Нет источников дохода</Text>│
  │      <Text c="dimmed" fz="sm">Добавьте...</Text>│
  │      <Button onClick={openForm}>               │
  │        + Источник дохода                       │
  │      </Button>                                 │
  │    </Stack>                                    │
  │  )}                                            │
  └─────────────────────────────────────────────────┘
  ┌─ Cards list ────────────────────────────────────┐
  │  {sources.map(s => <IncomeSourceCard key={s.id} │
  │    source={s} />)}                              │
  └─────────────────────────────────────────────────┘
</Stack>
```

### 2.2 Компонент карточки `<IncomeSourceCard>`

```tsx
// Структура карточки (Card с withBorder, p="lg", radius="md")
<Card withBorder p="lg" radius="md">
  {/* Секция заголовка с бордером снизу */}
  <Card.Section withBorder inheritPadding py="xs">
    <Group justify="space-between">
      {/* Левая часть: название + статус */}
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
      {/* Правая часть: сумма */}
      <Text fz="xl" fw={700} c="green">
        {formatMoney(source.expectedTotal, source.currency)} / мес
      </Text>
    </Group>
  </Card.Section>

  {/* Тело карточки */}
  <Stack gap={4} mt="sm">
    <Group gap="md">
      {/* Валюта */}
      <Group gap={4}>
        <Text fz="xs" c="dimmed">Валюта:</Text>
        <Badge size="xs" variant="outline">{source.currency}</Badge>
      </Group>
      {/* Количество траншей */}
      <Group gap={4}>
        <Text fz="xs" c="dimmed">Траншей:</Text>
        <Text fz="xs" fw={600}>{source.tranches.length}</Text>
      </Group>
    </Group>

    {/* Краткая сводка по траншам (первые 2) */}
    {source.tranches.slice(0, 2).map((t) => (
      <Text key={t.id ?? t.name} fz="xs" c="dimmed">
        · {t.name} — {t.dayOfMonth === -1 ? 'последний день' : `${t.dayOfMonth}-го`}
        {' '}({t.amountMode === 'Fixed'
          ? formatMoney(t.fixedAmount!, source.currency)
          : t.amountMode === 'PercentOfTotal'
          ? `${t.percentOfTotal}% от ${formatMoney(source.expectedTotal, source.currency)}`
          : `≈ ${formatMoney(t.fixedAmount!, source.currency)}`
        })
      </Text>
    ))}
    {source.tranches.length > 2 && (
      <Text fz="xs" c="dimmed">+ ещё {source.tranches.length - 2} транша</Text>
    )}
  </Stack>

  {/* Кнопки действий с бордером сверху */}
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
```

### 2.3 Состояния

| Состояние | Поведение |
|-----------|-----------|
| `loading=true` | 3 Skeleton-блока высотой 90px |
| `sources.length === 0` | Empty state с иконкой 💵, текстом и CTA-кнопкой |
| Нормальное | Список карточек, новые добавляются сверху |
| После деактивации | `isActive: false` → Badge меняется на серый, без перезагрузки |

### 2.4 Полный псевдокод страницы

```tsx
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
    const updated = await toggleIncomeSourceActive(s.id, !s.isActive); // API
    useIncomeSourceStore.getState().updateSource(updated);
    notifications.show({ title: updated.isActive ? 'Активирован' : 'Деактивирован', color: 'green' });
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
        <Stack gap="sm">{[1,2,3].map(i => <Skeleton key={i} h={120} radius="md" />)}</Stack>
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
          {sources.map(s => (
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
```

---

## 3. Экран 2: Форма создания / редактирования

**Компонент:** `src/components/IncomeSourceForm/IncomeSourceFormModal.tsx`  
**Паттерн:** Modal size="xl", closeOnClickOutside={false}, overlayProps={{ blur: 3 }}

### 3.1 Layout модала

```
Modal title: "Новый источник дохода" / "Редактировать: {name}"
size="xl"

<form onSubmit={form.onSubmit(handleSubmit)}>
  <Stack gap="md">
    ┌── Секция «Основное» ──────────────────────────────────┐
    │  <Divider label="Основное" labelPosition="left" />    │
    │  <Group grow>                                         │
    │    <TextInput label="Название" required />            │
    │    <Select label="Валюта" data={CURRENCIES} required />│
    │  </Group>                                             │
    │  <NumberInput label="Общая сумма / мес" required      │
    │    thousandSeparator=" " min={0.01} />                │
    └───────────────────────────────────────────────────────┘

    ┌── Секция «Транши» ────────────────────────────────────┐
    │  <Divider label="Транши" labelPosition="left" />      │
    │  <Accordion multiple variant="separated">             │
    │    {tranches.map((t, i) => <TranchePanel key={i} />)} │
    │  </Accordion>                                         │
    │  <Button variant="outline" style={{borderStyle:'dashed'}│
    │    onClick={addTranche}>                              │
    │    + Добавить транш                                   │
    │  </Button>                                            │
    └───────────────────────────────────────────────────────┘

    <Divider />
    <Group justify="flex-end">
      <Button variant="subtle" onClick={onClose}>Отмена</Button>
      <Button type="submit" loading={loading}>Сохранить</Button>
    </Group>
  </Stack>
</form>
```

### 3.2 FormValues

```typescript
interface TrancheFormValues {
  id?: number;
  name: string;
  dayOfMonth: number | '';
  amountMode: AmountMode;
  fixedAmount: number | '';
  percentOfTotal: number | '';
  distributionRules: DistributionRuleFormValues[];
}

interface DistributionRuleFormValues {
  accountId: number;
  valueMode: DistributionValueMode;
  percent: number | '';
  fixedAmount: number | '';
  delayDays: number | '';
  categoryId: string; // '' = без категории
}

interface IncomeSourceFormValues {
  name: string;
  currency: string;
  expectedTotal: number | '';
  tranches: TrancheFormValues[];
}
```

### 3.3 Панель транша (`<TranchePanel>`)

Каждый транш — один `Accordion.Item`:

```tsx
<Accordion.Item value={String(index)}>
  <Accordion.Control>
    {/* Заголовок: название + дата + сумма + кнопка удаления */}
    <Group justify="space-between" wrap="nowrap" style={{ flex: 1 }}>
      <Group gap="xs">
        <Text fw={600} fz="sm">
          {tranche.name || `Транш ${index + 1}`}
        </Text>
        {tranche.dayOfMonth !== '' && (
          <Badge size="xs" variant="dot" color="blue">
            {tranche.dayOfMonth === -1 ? 'посл. день' : `${tranche.dayOfMonth}-е`}
          </Badge>
        )}
      </Group>
      <Group gap="xs" wrap="nowrap">
        {/* Предпросмотр суммы транша */}
        <Text fz="sm" fw={600} c="green">
          {calcTrancheAmount(tranche, form.values.expectedTotal as number, currency)}
        </Text>
        {/* Кнопка удаления — только если > 1 транша */}
        {form.values.tranches.length > 1 && (
          <ActionIcon
            color="red"
            variant="subtle"
            size="sm"
            onClick={(e) => { e.stopPropagation(); removeTranche(index); }}
          >
            ×
          </ActionIcon>
        )}
      </Group>
    </Group>
  </Accordion.Control>

  <Accordion.Panel>
    <Stack gap="md" pt="xs">
      {/* Строка 1: название транша + день */}
      <Group grow>
        <TextInput
          label="Название транша"
          required
          placeholder="Например: Аванс"
          {...form.getInputProps(`tranches.${index}.name`)}
        />
        <NumberInput
          label="День месяца"
          required
          min={-1}
          max={31}
          description="-1 = последний день"
          {...form.getInputProps(`tranches.${index}.dayOfMonth`)}
        />
      </Group>

      {/* Строка 2: режим суммы */}
      <div>
        <Text fz="sm" fw={500} mb={4}>Режим суммы</Text>
        <SegmentedControl
          data={[
            { label: 'Фиксированная', value: 'Fixed' },
            { label: '% от общей', value: 'PercentOfTotal' },
            { label: 'Примерная', value: 'Estimated' },
          ]}
          {...form.getInputProps(`tranches.${index}.amountMode`)}
          onChange={(v) => {
            form.setFieldValue(`tranches.${index}.amountMode`, v as AmountMode);
            // Smart default: если переключаем в PercentOfTotal и это единственный транш → 100%
            if (v === 'PercentOfTotal' && form.values.tranches.length === 1) {
              form.setFieldValue(`tranches.${index}.percentOfTotal`, 100);
            }
          }}
        />
      </div>

      {/* Строка 3: поле суммы (зависит от режима) */}
      {tranche.amountMode === 'PercentOfTotal' ? (
        <Group align="flex-start">
          <NumberInput
            label="Процент от общей суммы"
            required
            min={0.01}
            max={100}
            suffix="%"
            decimalScale={2}
            w={180}
            {...form.getInputProps(`tranches.${index}.percentOfTotal`)}
          />
          {/* Вычисленная сумма в рублях */}
          <Stack gap={2} pt={24}>
            <Text fz="sm" c="dimmed">= </Text>
            <Text fz="sm" fw={600} c="green">
              {tranche.percentOfTotal && form.values.expectedTotal
                ? formatMoney(
                    (tranche.percentOfTotal / 100) * (form.values.expectedTotal as number),
                    form.values.currency
                  )
                : '—'}
            </Text>
          </Stack>
        </Group>
      ) : (
        <NumberInput
          label={tranche.amountMode === 'Estimated' ? 'Примерная сумма' : 'Фиксированная сумма'}
          description={tranche.amountMode === 'Estimated' ? 'Будет уточнена при подтверждении' : undefined}
          required
          min={0.01}
          thousandSeparator=" "
          decimalSeparator=","
          suffix={` ${form.values.currency}`}
          {...form.getInputProps(`tranches.${index}.fixedAmount`)}
        />
      )}

      {/* Секция распределения по счетам */}
      <Divider label="Распределение по счетам" labelPosition="left" />
      <DistributionTable
        trancheIndex={index}
        form={form}
        accounts={accounts}
        categories={categories}
        currency={form.values.currency}
        trancheAmount={calcTrancheAmount(tranche, form.values.expectedTotal as number, form.values.currency, 'number')}
      />
    </Stack>
  </Accordion.Panel>
</Accordion.Item>
```

### 3.4 Таблица распределения `<DistributionTable>` — КЛЮЧЕВАЯ ЧАСТЬ

#### Layout

```
┌─ Шапка ─────────────────────────────────────────────────────────────────────┐
│ Счёт          │ Режим              │ Значение  │ Задержка │ Сумма     │  ×  │
├───────────────┼────────────────────┼───────────┼──────────┼───────────┼─────┤
│ Tinkoff Debit │[Percent|Фикс|Остат]│ [______%] │  [0] дн  │ 50 000 ₽ │  ×  │
│ Savings       │[Percent|Фикс|Остат]│ [50_000 ] │  [3] дн  │ 50 000 ₽ │  ×  │
├───────────────────────────────────────────────────────────────────────────────┤
│ [+ Добавить счёт в распределение]                                            │
├───────────────────────────────────────────────────────────────────────────────┤
│ Распределено: 100 000 ₽ (100%) ████████████████████ 100%  ✓ Все распределено │
└───────────────────────────────────────────────────────────────────────────────┘
```

#### Псевдокод компонента

```tsx
interface DistributionTableProps {
  trancheIndex: number;
  form: UseFormReturnType<IncomeSourceFormValues>;
  accounts: Account[];
  categories: Category[];
  currency: string;
  trancheAmount: number; // вычисленная сумма транша в числе
}

function DistributionTable({
  trancheIndex, form, accounts, categories, currency, trancheAmount
}: DistributionTableProps) {
  const rules = form.values.tranches[trancheIndex].distributionRules;
  const basePath = `tranches.${trancheIndex}.distributionRules`;

  // ── Вычисление итогов ──────────────────────────────────────────────────
  // Считаем сколько уже распределено
  const { totalDistributed, totalPercent, hasRemainder } = useMemo(() => {
    let fixedSum = 0;
    let percentSum = 0;
    let hasRemainder = false;

    rules.forEach((r) => {
      if (r.valueMode === 'FixedAmount' && r.fixedAmount) {
        fixedSum += r.fixedAmount as number;
      } else if (r.valueMode === 'Percent' && r.percent) {
        percentSum += r.percent as number;
        fixedSum += (trancheAmount * (r.percent as number)) / 100;
      } else if (r.valueMode === 'Remainder') {
        hasRemainder = true;
      }
    });

    const remainderAmount = hasRemainder ? trancheAmount - fixedSum : 0;
    const totalDistributed = fixedSum + remainderAmount;
    const totalPercent = trancheAmount > 0
      ? Math.round((totalDistributed / trancheAmount) * 100)
      : 0;

    return { totalDistributed, totalPercent, hasRemainder };
  }, [rules, trancheAmount]);

  // ── Smart defaults при добавлении счёта ───────────────────────────────
  const addRule = () => {
    const availableAccounts = accounts.filter(
      (a) => !a.isArchived && !rules.some((r) => r.accountId === a.id)
    );
    if (availableAccounts.length === 0) return;

    const firstAvailable = availableAccounts[0];
    // Smart default: если это первый счёт → Remainder
    // Если уже есть один счёт с Remainder → Percent
    const hasRemainderRule = rules.some((r) => r.valueMode === 'Remainder');
    const newRule: DistributionRuleFormValues = {
      accountId: firstAvailable.id,
      valueMode: rules.length === 0 ? 'Remainder' : hasRemainderRule ? 'Percent' : 'Remainder',
      percent: '',
      fixedAmount: '',
      delayDays: 0,
      categoryId: '',
    };
    form.setFieldValue(basePath, [...rules, newRule]);
  };

  const removeRule = (ruleIndex: number) => {
    form.setFieldValue(basePath, rules.filter((_, i) => i !== ruleIndex));
  };

  // ── Вычисление суммы для конкретного правила ──────────────────────────
  const calcRuleAmount = (rule: DistributionRuleFormValues): number | null => {
    if (!trancheAmount) return null;
    if (rule.valueMode === 'Percent' && rule.percent) {
      return (trancheAmount * (rule.percent as number)) / 100;
    }
    if (rule.valueMode === 'FixedAmount' && rule.fixedAmount) {
      return rule.fixedAmount as number;
    }
    if (rule.valueMode === 'Remainder') {
      // Remainder = trancheAmount - sum(все Fixed и Percent)
      let used = 0;
      rules.forEach((r, i) => {
        if (r.valueMode === 'FixedAmount' && r.fixedAmount) {
          used += r.fixedAmount as number;
        } else if (r.valueMode === 'Percent' && r.percent) {
          used += (trancheAmount * (r.percent as number)) / 100;
        }
      });
      return trancheAmount - used;
    }
    return null;
  };

  // ── Список счетов уже не в распределении (для Select добавления) ──────
  const usedAccountIds = new Set(rules.map((r) => r.accountId));
  const availableForAdd = accounts
    .filter((a) => !a.isArchived && !usedAccountIds.has(a.id))
    .map((a) => ({ value: String(a.id), label: a.name }));

  // ── Категории для Select ──────────────────────────────────────────────
  const categoryData = [
    { value: '', label: 'Без категории' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // ── Цвет прогресс-бара ────────────────────────────────────────────────
  const progressColor = totalPercent === 100
    ? 'green'
    : totalPercent > 100
    ? 'red'
    : 'blue';

  return (
    <Stack gap="xs">
      {/* Строки правил */}
      {rules.length === 0 ? (
        <Text fz="xs" c="dimmed" ta="center" py="sm">
          Ни один счёт не добавлен. Нажмите «+ Добавить счёт».
        </Text>
      ) : (
        <Stack gap="xs">
          {rules.map((rule, ruleIndex) => {
            const account = accounts.find((a) => a.id === rule.accountId);
            const ruleAmount = calcRuleAmount(rule);
            const rulePath = `${basePath}.${ruleIndex}`;

            return (
              <Paper key={ruleIndex} p="sm" withBorder radius="sm">
                <Stack gap="xs">
                  {/* Строка 1: название счёта + режим + значение + удалить */}
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    {/* Название счёта (нередактируемое) */}
                    <Stack gap={2} style={{ flex: '0 0 160px' }}>
                      <Text fz="xs" c="dimmed">Счёт</Text>
                      <Text fz="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                        {account?.name ?? `Счёт #${rule.accountId}`}
                      </Text>
                    </Stack>

                    {/* Режим */}
                    <Stack gap={2} style={{ flex: '0 0 auto' }}>
                      <Text fz="xs" c="dimmed">Режим</Text>
                      <SegmentedControl
                        size="xs"
                        data={[
                          { label: '%', value: 'Percent' },
                          { label: 'Сумма', value: 'FixedAmount' },
                          { label: 'Остаток', value: 'Remainder' },
                        ]}
                        {...form.getInputProps(`${rulePath}.valueMode`)}
                        onChange={(v) => {
                          form.setFieldValue(`${rulePath}.valueMode`, v as DistributionValueMode);
                          // Сбрасываем значения при смене режима
                          form.setFieldValue(`${rulePath}.percent`, '');
                          form.setFieldValue(`${rulePath}.fixedAmount`, '');
                        }}
                      />
                    </Stack>

                    {/* Значение (зависит от режима) */}
                    <Stack gap={2} style={{ flex: 1, minWidth: 80 }}>
                      <Text fz="xs" c="dimmed">Значение</Text>
                      {rule.valueMode === 'Percent' ? (
                        <NumberInput
                          size="xs"
                          min={0.01}
                          max={100}
                          suffix="%"
                          decimalScale={2}
                          placeholder="50"
                          {...form.getInputProps(`${rulePath}.percent`)}
                        />
                      ) : rule.valueMode === 'FixedAmount' ? (
                        <NumberInput
                          size="xs"
                          min={0.01}
                          thousandSeparator=" "
                          placeholder="50 000"
                          {...form.getInputProps(`${rulePath}.fixedAmount`)}
                        />
                      ) : (
                        /* Remainder: нет поля ввода */
                        <Text fz="xs" c="dimmed" pt={4}>— всё остальное</Text>
                      )}
                    </Stack>

                    {/* Задержка в днях */}
                    <Stack gap={2} style={{ flex: '0 0 80px' }}>
                      <Text fz="xs" c="dimmed">Задержка</Text>
                      <NumberInput
                        size="xs"
                        min={0}
                        max={30}
                        suffix=" дн"
                        {...form.getInputProps(`${rulePath}.delayDays`)}
                      />
                    </Stack>

                    {/* Вычисленная сумма */}
                    <Stack gap={2} style={{ flex: '0 0 100px' }} align="flex-end">
                      <Text fz="xs" c="dimmed">Сумма</Text>
                      <Text fz="sm" fw={700} c={ruleAmount !== null ? 'green' : 'dimmed'}>
                        {ruleAmount !== null ? formatMoney(ruleAmount, currency) : '—'}
                      </Text>
                    </Stack>

                    {/* Кнопка удаления */}
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      size="sm"
                      mt={20}
                      onClick={() => removeRule(ruleIndex)}
                    >
                      ×
                    </ActionIcon>
                  </Group>

                  {/* Строка 2 (compact): категория для операции */}
                  <Group gap="xs">
                    <Text fz="xs" c="dimmed">Категория операции:</Text>
                    <Select
                      size="xs"
                      data={categoryData}
                      clearable
                      style={{ flex: 1, maxWidth: 220 }}
                      {...form.getInputProps(`${rulePath}.categoryId`)}
                    />
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Кнопка добавления счёта */}
      {availableForAdd.length > 0 && (
        <Button
          variant="outline"
          size="xs"
          style={{ borderStyle: 'dashed', alignSelf: 'flex-start' }}
          onClick={addRule}
        >
          + Добавить счёт в распределение
        </Button>
      )}

      {/* ИТОГОВАЯ СТРОКА */}
      {rules.length > 0 && (
        <Paper p="sm" radius="sm"
          bg={totalPercent === 100 ? 'green.0' : totalPercent > 100 ? 'red.0' : 'blue.0'}
          style={{ border: `1px solid var(--mantine-color-${progressColor}-3)` }}
        >
          <Group justify="space-between" mb="xs">
            <Text fz="sm" fw={600}>
              Распределено: {formatMoney(totalDistributed, currency)}
              {hasRemainder && ' (с остатком)'}
            </Text>
            <Group gap="xs">
              <Text fz="sm" fw={700} c={progressColor}>
                {totalPercent}%
              </Text>
              {totalPercent === 100 && (
                <Text fz="sm" c="green">✓</Text>
              )}
            </Group>
          </Group>
          <Progress
            value={Math.min(totalPercent, 100)}
            color={progressColor}
            size="sm"
            radius="xl"
          />
          {/* Предупреждения */}
          {!hasRemainder && totalPercent < 100 && trancheAmount > 0 && (
            <Text fz="xs" c="orange" mt="xs">
              ⚠ Не распределено {formatMoney(trancheAmount - totalDistributed, currency)}.
              Добавьте счёт с режимом «Остаток» или увеличьте %.
            </Text>
          )}
          {totalPercent > 100 && (
            <Text fz="xs" c="red" mt="xs">
              ✗ Распределено больше 100% — суммы превышают сумму транша.
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  );
}
```

### 3.5 Валидация формы

```typescript
// В useForm validate:
validate: {
  name: (v) => !v.trim() ? 'Введите название' : null,
  currency: (v) => !v ? 'Выберите валюту' : null,
  expectedTotal: (v) => (!v || (v as number) <= 0) ? 'Введите сумму больше 0' : null,

  // Валидация траншей — проверяем через custom validator
  tranches: {
    name: (v) => !v.trim() ? 'Введите название транша' : null,
    dayOfMonth: (v) => {
      const n = v as number;
      if (v === '') return 'Введите день';
      if (n !== -1 && (n < 1 || n > 31)) return 'День от 1 до 31 (или -1)';
      return null;
    },
    fixedAmount: (v, values, path) => {
      // Достаём mode по пути: tranches.0.fixedAmount → tranches.0.amountMode
      const trancheIndex = Number(path.split('.')[1]);
      const mode = values.tranches[trancheIndex]?.amountMode;
      if (mode === 'PercentOfTotal') return null;
      if (!v || (v as number) <= 0) return 'Введите сумму больше 0';
      return null;
    },
    percentOfTotal: (v, values, path) => {
      const trancheIndex = Number(path.split('.')[1]);
      const mode = values.tranches[trancheIndex]?.amountMode;
      if (mode !== 'PercentOfTotal') return null;
      const n = v as number;
      if (!n || n <= 0) return 'Введите процент';
      if (n > 100) return 'Максимум 100%';
      return null;
    },
  },
},

// Дополнительная cross-field валидация в handleSubmit (перед отправкой):
// 1. Сумма % всех траншей с PercentOfTotal не должна превышать 100%
// 2. Для каждого транша — если нет правил Remainder, totalPercent должен быть === 100%
// Показывать как notifications.show({ color: 'red', ... })
```

### 3.6 Интерактивность в реальном времени

| Триггер | Что пересчитывается |
|---------|---------------------|
| Изменение `expectedTotal` | Суммы всех траншей с PercentOfTotal и Estimated, итоги в DistributionTable |
| Изменение `percentOfTotal` транша | Отображаемая сумма транша, итоговый прогресс-бар DistributionTable |
| Изменение `fixedAmount` транша | Итоговый прогресс-бар DistributionTable |
| Изменение `percent` правила | Вычисленная сумма строки, итог таблицы, прогресс-бар |
| Изменение `fixedAmount` правила | То же самое |
| Переключение `valueMode` правила | Сброс значения, пересчёт итогов |
| Добавление/удаление правила | Пересчёт Remainder, итогов |

Все пересчёты происходят через `useMemo` в `DistributionTable`, без debounce — реакция немедленная.

### 3.7 Smart defaults при создании нового источника

```typescript
// Начальные значения формы
const defaultTranche = (): TrancheFormValues => ({
  name: 'Основная выплата',
  dayOfMonth: 25,
  amountMode: 'Fixed',
  fixedAmount: '',
  percentOfTotal: '',
  distributionRules: accounts.length === 1
    ? [{
        // Автоматически добавляем единственный счёт с Remainder
        accountId: accounts[0].id,
        valueMode: 'Remainder',
        percent: '',
        fixedAmount: '',
        delayDays: 0,
        categoryId: '',
      }]
    : [],
});

const initialValues: IncomeSourceFormValues = initial
  ? mapSourceToFormValues(initial)
  : {
      name: '',
      currency: 'RUB',
      expectedTotal: '',
      tranches: [defaultTranche()],
    };
```

---

## 4. Экран 3: Модал «Сгенерировать операции»

**Компонент:** `src/components/IncomeSourceForm/GenerateOperationsModal.tsx`

### 4.1 Layout

```
Modal title="Сгенерировать операции: {source.name}"
size="xl"

<Stack gap="md">
  ┌── Выбор периода ──────────────────────────────────────────┐
  │  <SegmentedControl>                                       │
  │    [Один месяц] [Диапазон]                               │
  │  </SegmentedControl>                                      │
  │                                                           │
  │  {mode === 'single' && (                                  │
  │    <MonthPickerInput                                      │
  │      label="Месяц"                                        │
  │      value={month} onChange={setMonth}                    │
  │    />                                                     │
  │  )}                                                       │
  │  {mode === 'range' && (                                   │
  │    <Group grow>                                           │
  │      <MonthPickerInput label="С" ... />                   │
  │      <MonthPickerInput label="По" ... />                  │
  │    </Group>                                               │
  │  )}                                                       │
  └───────────────────────────────────────────────────────────┘

  ┌── Предпросмотр ────────────────────────────────────────────┐
  │  {preview ? (                                             │
  │    <>                                                     │
  │      {hasDuplicates && <Alert color="orange" icon="⚠">   │
  │        Некоторые операции уже существуют...               │
  │      </Alert>}                                            │
  │      <Table striped highlightOnHover>                     │
  │        <thead><tr>                                        │
  │          <th>Дата</th><th>Счёт</th>                      │
  │          <th>Сумма</th><th>Категория</th>                 │
  │        </tr></thead>                                      │
  │        <tbody>{preview.map(row => <tr>...)}</tbody>       │
  │      </Table>                                             │
  │      <Text fz="sm" fw={600}>                             │
  │        Итого: {preview.length} операций на ...           │
  │      </Text>                                             │
  │    </>                                                    │
  │  )}                                                       │
  └───────────────────────────────────────────────────────────┘

  <Divider />
  <Group justify="flex-end">
    <Button variant="subtle" onClick={onClose}>Отмена</Button>
    {!preview ? (
      <Button onClick={handlePreview} loading={loading}>
        Предпросмотр
      </Button>
    ) : (
      <Button color="green" onClick={handleCreate} loading={loading}>
        Создать {preview.length} операций
      </Button>
    )}
  </Group>
</Stack>
```

### 4.2 Полный псевдокод

```tsx
function GenerateOperationsModal({ opened, onClose, source, accounts }) {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [month, setMonth] = useState<Date | null>(new Date());
  const [rangeFrom, setRangeFrom] = useState<Date | null>(new Date());
  const [rangeTo, setRangeTo] = useState<Date | null>(null);
  const [preview, setPreview] = useState<GeneratedOpPreview[] | null>(null);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [loading, setLoading] = useState(false);

  // GeneratedOpPreview: { date: string, accountId: number, amount: number, categoryId?: number, isDuplicate: boolean }

  const handlePreview = async () => {
    setLoading(true);
    try {
      const params = mode === 'single'
        ? { months: [formatYearMonth(month!)] }
        : { months: getMonthRange(rangeFrom!, rangeTo!) };
      const result = await previewGenerateOperations(source.id, params); // API call
      setPreview(result.operations);
      setHasDuplicates(result.operations.some((op) => op.isDuplicate));
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const nonDuplicates = preview.filter((op) => !op.isDuplicate);
      await createGeneratedOperations(source.id, nonDuplicates); // API call
      notifications.show({
        title: 'Готово',
        message: `Создано ${nonDuplicates.length} операций`,
        color: 'green',
      });
      onClose();
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  // Сбрасываем preview при изменении периода
  useEffect(() => { setPreview(null); }, [mode, month, rangeFrom, rangeTo]);

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Сгенерировать операции: ${source.name}`}
      size="xl"
      closeOnClickOutside={false}
      overlayProps={{ blur: 3 }}
    >
      <Stack gap="md">
        <SegmentedControl
          data={[
            { label: 'Один месяц', value: 'single' },
            { label: 'Диапазон', value: 'range' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'single' | 'range')}
        />

        {mode === 'single' ? (
          <MonthPickerInput
            label="Месяц"
            value={month}
            onChange={setMonth}
            required
            maxDate={new Date(new Date().getFullYear() + 1, 11)}
          />
        ) : (
          <Group grow>
            <MonthPickerInput label="С" value={rangeFrom} onChange={setRangeFrom} required />
            <MonthPickerInput
              label="По"
              value={rangeTo}
              onChange={setRangeTo}
              required
              minDate={rangeFrom ?? undefined}
            />
          </Group>
        )}

        {preview !== null && (
          <Stack gap="xs">
            {hasDuplicates && (
              <Alert
                color="orange"
                icon="⚠"
                title="Возможные дубликаты"
              >
                Некоторые операции, помеченные ниже *, уже существуют в системе и будут пропущены.
              </Alert>
            )}

            <Paper withBorder radius="sm">
              <Table striped highlightOnHover fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Дата</Table.Th>
                    <Table.Th>Счёт</Table.Th>
                    <Table.Th>Транш</Table.Th>
                    <Table.Th ta="right">Сумма</Table.Th>
                    <Table.Th>Категория</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((row, i) => (
                    <Table.Tr
                      key={i}
                      style={{ opacity: row.isDuplicate ? 0.5 : 1 }}
                    >
                      <Table.Td c="dimmed">{formatDateCompact(row.date)}</Table.Td>
                      <Table.Td fw={500}>{accountName(row.accountId)}</Table.Td>
                      <Table.Td c="dimmed">{row.trancheName}</Table.Td>
                      <Table.Td ta="right" fw={700} c="green">
                        +{formatMoney(row.amount, source.currency)}
                        {row.isDuplicate && (
                          <Text component="span" fz="xs" c="orange"> *</Text>
                        )}
                      </Table.Td>
                      <Table.Td c="dimmed">{row.categoryName ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>

            <Text fz="sm" fw={600}>
              Итого: {preview.filter((op) => !op.isDuplicate).length} операций ·{' '}
              {formatMoney(
                preview.filter((op) => !op.isDuplicate).reduce((s, op) => s + op.amount, 0),
                source.currency
              )}
            </Text>
          </Stack>
        )}

        <Divider />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={loading}>Отмена</Button>
          {preview === null ? (
            <Button onClick={handlePreview} loading={loading}>
              Предпросмотр
            </Button>
          ) : (
            <Button
              color="green"
              onClick={handleCreate}
              loading={loading}
              disabled={preview.filter((op) => !op.isDuplicate).length === 0}
            >
              Создать {preview.filter((op) => !op.isDuplicate).length} операций
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
```

---

## 5. Экран 4: Модал «Подтвердить транш»

**Компонент:** `src/components/IncomeSourceForm/ConfirmTrancheModal.tsx`

Этот модал открывается из карточки конкретного транша (например, через пункт в меню карточки IncomeSource).

### 5.1 Layout

```
Modal title="Подтвердить транш: {tranche.name}"
size="md"

<Stack gap="md">
  ┌── Информация о транше ─────────────────────────────────────┐
  │  <Paper p="sm" bg="blue.0" withBorder>                    │
  │    <Group justify="space-between">                         │
  │      <Stack gap={2}>                                       │
  │        <Text fz="sm" c="dimmed">Ожидаемая дата</Text>     │
  │        <Text fw={600}>{formatDate(expectedDate)}</Text>    │
  │        <Text fz="xs" c="dimmed">                          │
  │          через {daysUntil} дней                           │
  │        </Text>                                             │
  │      </Stack>                                              │
  │      <Stack gap={2} align="flex-end">                      │
  │        <Text fz="sm" c="dimmed">Плановая сумма</Text>     │
  │        <Text fw={700} fz="lg" c="green">                  │
  │          {formatMoney(plannedAmount, currency)}            │
  │        </Text>                                             │
  │      </Stack>                                              │
  │    </Group>                                                │
  │  </Paper>                                                  │
  └───────────────────────────────────────────────────────────┘

  ┌── Фактическая сумма ───────────────────────────────────────┐
  │  <NumberInput                                             │
  │    label="Фактическая сумма"                              │
  │    description="Оставьте плановую если пришла вся сумма"  │
  │    required                                               │
  │    thousandSeparator=" "                                  │
  │    suffix={` ${currency}`}                               │
  │    value={actualAmount}                                   │
  │    onChange={setActualAmount}                             │
  │    min={0.01}                                             │
  │  />                                                       │
  └───────────────────────────────────────────────────────────┘

  ┌── Preview распределения ───────────────────────────────────┐
  │  <Divider label="Будет создано операций" />               │
  │  {distributionPreview.map(item => (                       │
  │    <Group justify="space-between">                        │
  │      <Text fz="sm">{accountName(item.accountId)}</Text>  │
  │      <Group gap="xs">                                     │
  │        <Text fz="xs" c="dimmed">                         │
  │          {item.delayDays > 0 ? `+${item.delayDays}д` : 'сегодня'} │
  │        </Text>                                            │
  │        <Text fw={600} c="green">                         │
  │          +{formatMoney(item.amount, currency)}            │
  │        </Text>                                            │
  │      </Group>                                             │
  │    </Group>                                               │
  │  ))}                                                      │
  └───────────────────────────────────────────────────────────┘

  <Divider />
  <Group justify="flex-end">
    <Button variant="subtle" onClick={onClose}>Отмена</Button>
    <Button color="green" loading={loading} onClick={handleConfirm}>
      ✓ Подтвердить
    </Button>
  </Group>
</Stack>
```

### 5.2 Псевдокод

```tsx
function ConfirmTrancheModal({ opened, onClose, source, tranche, accounts }) {
  const expectedDate = calcNextTrancheDate(tranche.dayOfMonth); // -> Date
  const daysUntil = Math.ceil((expectedDate.getTime() - Date.now()) / 86400000);
  const plannedAmount = calcTrancheAmount(tranche, source.expectedTotal, source.currency, 'number');

  const [actualAmount, setActualAmount] = useState<number | ''>(plannedAmount || '');
  const [loading, setLoading] = useState(false);

  // Пересчёт распределения при изменении actualAmount
  const distributionPreview = useMemo(() => {
    const amount = actualAmount as number;
    if (!amount) return [];
    return calcDistribution(tranche.distributionRules, amount); // -> { accountId, amount, delayDays }[]
  }, [actualAmount, tranche.distributionRules]);

  const handleConfirm = async () => {
    if (!actualAmount) return;
    setLoading(true);
    try {
      // Создаём операции для каждого правила распределения
      await confirmTranche(source.id, tranche.id!, {
        actualAmount: actualAmount as number,
        date: toISODateString(expectedDate),
      }); // API call — сервер сам создаёт PlannedOperation для каждого DistributionRule
      notifications.show({ title: 'Подтверждено', message: 'Транш подтверждён', color: 'green' });
      onClose();
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Подтвердить транш: ${tranche.name}`}
      size="md"
      closeOnClickOutside={false}
      overlayProps={{ blur: 3 }}
    >
      {/* ... (layout выше) */}
    </Modal>
  );
}
```

---

## 6. Экран 5: Виджет на AccountDetail

**Место:** В `AccountDetail.tsx`, после блока с балансом, перед списком операций.

### 6.1 Условие отображения

Виджет показывается если: есть хотя бы одно активное правило распределения (`DistributionRule`) на этот счёт.

### 6.2 Layout

```tsx
// Добавить в AccountDetail.tsx после блока <Paper p="lg" withBorder>
{nextIncome && (
  <Paper p="md" withBorder radius="md"
    style={{ borderLeft: '4px solid var(--mantine-color-green-5)' }}
  >
    <Group justify="space-between" wrap="nowrap">
      <Stack gap={2}>
        <Text fz="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.5 }}>
          Следующее пополнение
        </Text>
        <Group gap="xs" align="baseline">
          <Text fw={700} fz="lg" c="green">
            {formatMoney(nextIncome.amount, nextIncome.currency)}
          </Text>
          <Text fz="sm" c="dimmed">
            {formatDateCompact(nextIncome.date)} · через {nextIncome.daysUntil} дн.
          </Text>
        </Group>
        <Text fz="xs" c="dimmed">
          {nextIncome.sourceName} · {nextIncome.trancheName}
        </Text>
      </Stack>
      <Stack gap={2} align="flex-end">
        {minBalance !== null && (
          <>
            <Text fz="xs" c="dimmed">Мин. баланс до пополнения</Text>
            <Text fw={600} fz="sm" c={minBalance < 0 ? 'red' : 'dimmed'}>
              {formatMoney(minBalance, account.balances[0]?.currency ?? 'RUB')}
            </Text>
          </>
        )}
        <Anchor
          fz="xs"
          c="blue"
          onClick={() => navigate('/cashpulse/income-sources')}
        >
          Настройки источника →
        </Anchor>
      </Stack>
    </Group>
  </Paper>
)}
```

### 6.3 Вычисление `nextIncome` и `minBalance`

```typescript
// В AccountDetail.tsx — хук useNextIncome(accountId)
function useNextIncome(accountId: number) {
  const { sources } = useIncomeSourceStore();
  const today = new Date();

  return useMemo(() => {
    // Ищем все активные источники с правилами распределения на этот счёт
    const candidates: {
      date: Date;
      amount: number;
      currency: string;
      sourceName: string;
      trancheName: string;
      daysUntil: number;
    }[] = [];

    for (const source of sources) {
      if (!source.isActive) continue;
      for (const tranche of source.tranches) {
        const hasRule = tranche.distributionRules.some((r) => r.accountId === accountId);
        if (!hasRule) continue;

        const nextDate = calcNextDate(tranche.dayOfMonth, today);
        const rule = tranche.distributionRules.find((r) => r.accountId === accountId)!;
        const trancheTotal = calcTrancheAmountNumber(tranche, source.expectedTotal);
        const ruleAmount = calcRuleAmountNumber(rule, trancheTotal, tranche.distributionRules);

        candidates.push({
          date: nextDate,
          amount: ruleAmount,
          currency: source.currency,
          sourceName: source.name,
          trancheName: tranche.name,
          daysUntil: Math.ceil((nextDate.getTime() - today.getTime()) / 86400000),
        });
      }
    }

    if (candidates.length === 0) return null;
    // Берём ближайший
    return candidates.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  }, [sources, accountId]);
}
```

---

## 7. Утилиты вычислений

**Файл:** `src/utils/incomeSourceCalc.ts`

```typescript
import type { IncomeTranche, DistributionRule, DistributionRuleFormValues } from '../api/types';
import { formatMoney } from './formatMoney';

/**
 * Вычисляет сумму транша в числовом виде
 */
export function calcTrancheAmountNumber(
  tranche: Pick<IncomeTranche, 'amountMode' | 'fixedAmount' | 'percentOfTotal'>,
  expectedTotal: number
): number {
  if (tranche.amountMode === 'PercentOfTotal' && tranche.percentOfTotal) {
    return (expectedTotal * tranche.percentOfTotal) / 100;
  }
  return tranche.fixedAmount ?? 0;
}

/**
 * Форматированная сумма транша для отображения
 */
export function calcTrancheAmount(
  tranche: Pick<IncomeTranche, 'amountMode' | 'fixedAmount' | 'percentOfTotal'>,
  expectedTotal: number,
  currency: string,
  output: 'formatted' | 'number' = 'formatted'
): string | number {
  const amount = calcTrancheAmountNumber(tranche, expectedTotal);
  if (output === 'number') return amount;
  return amount > 0 ? formatMoney(amount, currency) : '—';
}

/**
 * Вычисляет сумму для конкретного правила распределения
 */
export function calcRuleAmountNumber(
  rule: Pick<DistributionRule, 'valueMode' | 'percent' | 'fixedAmount'>,
  trancheAmount: number,
  allRules: Pick<DistributionRule, 'valueMode' | 'percent' | 'fixedAmount'>[]
): number {
  if (rule.valueMode === 'Percent' && rule.percent) {
    return (trancheAmount * rule.percent) / 100;
  }
  if (rule.valueMode === 'FixedAmount' && rule.fixedAmount) {
    return rule.fixedAmount;
  }
  if (rule.valueMode === 'Remainder') {
    let used = 0;
    allRules.forEach((r) => {
      if (r.valueMode === 'FixedAmount' && r.fixedAmount) used += r.fixedAmount;
      if (r.valueMode === 'Percent' && r.percent) used += (trancheAmount * r.percent) / 100;
    });
    return Math.max(0, trancheAmount - used);
  }
  return 0;
}

/**
 * Вычисляет следующую дату выплаты для дня месяца
 */
export function calcNextDate(dayOfMonth: number, from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();

  const getActualDay = (d: number, y: number, m: number) => {
    if (d === -1) return new Date(y, m + 1, 0).getDate(); // последний день
    return Math.min(d, new Date(y, m + 1, 0).getDate()); // не больше дней в месяце
  };

  const thisMonthDay = getActualDay(dayOfMonth, year, month);
  const thisMonthDate = new Date(year, month, thisMonthDay);

  if (thisMonthDate > from) return thisMonthDate;

  // Следующий месяц
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonthDay = getActualDay(dayOfMonth, nextYear, nextMonth);
  return new Date(nextYear, nextMonth, nextMonthDay);
}

/**
 * Итоги по таблице распределения (для прогресс-бара)
 */
export function calcDistributionSummary(
  rules: Pick<DistributionRuleFormValues, 'valueMode' | 'percent' | 'fixedAmount'>[],
  trancheAmount: number
): { totalDistributed: number; totalPercent: number; hasRemainder: boolean } {
  let fixedSum = 0;
  let hasRemainder = false;

  rules.forEach((r) => {
    if (r.valueMode === 'FixedAmount' && r.fixedAmount) {
      fixedSum += r.fixedAmount as number;
    } else if (r.valueMode === 'Percent' && r.percent) {
      fixedSum += (trancheAmount * (r.percent as number)) / 100;
    } else if (r.valueMode === 'Remainder') {
      hasRemainder = true;
    }
  });

  const totalDistributed = hasRemainder ? trancheAmount : fixedSum;
  const totalPercent = trancheAmount > 0
    ? Math.round((fixedSum / trancheAmount) * 100)
    : 0;

  return { totalDistributed, totalPercent, hasRemainder };
}
```

---

## Приложение: Структура файлов

```
src/
├── pages/
│   └── IncomeSources.tsx                  ← Экран 1 (заменить существующий)
├── components/
│   └── IncomeSourceForm/
│       ├── IncomeSourceFormModal.tsx       ← Экран 2 (Modal + секции)
│       ├── TranchePanel.tsx               ← Accordion.Item для транша
│       ├── DistributionTable.tsx          ← Таблица распределения по счетам
│       ├── GenerateOperationsModal.tsx    ← Экран 3
│       ├── ConfirmTrancheModal.tsx        ← Экран 4
│       └── IncomeSourceCard.tsx           ← Карточка в списке
├── store/
│   └── useIncomeSourceStore.ts
├── api/
│   ├── types.ts                           ← Дополнить типами из раздела 1.1
│   └── incomeSources.ts                   ← API-функции
└── utils/
    └── incomeSourceCalc.ts                ← Утилиты из раздела 7
```

---

## Приложение: Сводная таблица компонентов Mantine

| Компонент | Где используется |
|-----------|-----------------|
| `Stack`, `Group` | Везде — основные layout-примитивы |
| `Card`, `Card.Section` | IncomeSourceCard (аналог AccountCard) |
| `Paper` | Строки DistributionTable, виджет AccountDetail, preview-блоки |
| `Modal` | Экраны 2, 3, 4 |
| `Accordion`, `Accordion.Item`, `Accordion.Control`, `Accordion.Panel` | TranchePanel |
| `SegmentedControl` | Режим суммы транша, режим правила (Percent/Fixed/Remainder), период генерации |
| `NumberInput` | Суммы, проценты, дни задержки |
| `TextInput` | Названия |
| `Select` | Валюта, категория |
| `Badge` | Статус active/inactive, валюта, день месяца |
| `Progress` | Прогресс-бар распределения |
| `ActionIcon` | Кнопки удаления транша/правила |
| `Divider` | Разделение секций, с label |
| `Skeleton` | Состояние загрузки |
| `Alert` | Предупреждение о дубликатах в Экране 3 |
| `MonthPickerInput` | Выбор месяца в Экране 3 |
| `Table`, `Table.Thead`, `Table.Tbody`, `Table.Tr`, `Table.Th`, `Table.Td` | Preview-таблица в Экране 3 |
| `Anchor` | Ссылка на настройки источника в виджете |
| `notifications` | Все уведомления об успехе/ошибке |
| `useDisclosure` | Управление модалами |
| `useForm` | Форма источника дохода |
