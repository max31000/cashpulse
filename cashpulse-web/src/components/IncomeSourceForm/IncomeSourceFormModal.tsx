import { useState, useMemo } from 'react';
import {
  Modal, Stack, Group, Button, TextInput, Select, NumberInput,
  Textarea, Divider, Accordion, SegmentedControl, Text, ActionIcon,
  Badge, Paper, Progress,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { Account, Category, IncomeSource, AmountMode, DistributionValueMode } from '../../api/types';
import { createIncomeSource, updateIncomeSource } from '../../api/incomeSources';
import { formatMoney } from '../../utils/formatMoney';
import type { DistributionRuleFormValues } from '../../utils/incomeSourceCalc';

// ─── Form value types ────────────────────────────────────────────────────────

interface TrancheFormValues {
  id?: number;
  name: string;
  dayOfMonth: number | '';
  amountMode: AmountMode;
  fixedAmount: number | '';
  percentOfTotal: number | '';
  distributionRules: DistributionRuleFormValues[];
}

interface IncomeSourceFormValues {
  name: string;
  currency: string;
  expectedTotal: number | '';
  description: string;
  tranches: TrancheFormValues[];
}

const CURRENCIES = ['RUB', 'USD', 'EUR'];

// ─── Helper: map IncomeSource → form values ──────────────────────────────────

function mapSourceToFormValues(s: IncomeSource): IncomeSourceFormValues {
  return {
    name: s.name,
    currency: s.currency,
    expectedTotal: s.expectedTotal ?? '',
    description: s.description ?? '',
    tranches: s.tranches.map((t) => ({
      id: t.id,
      name: t.name,
      dayOfMonth: t.dayOfMonth,
      amountMode: t.amountMode,
      fixedAmount: t.fixedAmount ?? '',
      percentOfTotal: t.percentOfTotal ?? '',
      distributionRules: t.distributionRules.map((r) => ({
        accountId: r.accountId,
        valueMode: r.valueMode,
        percent: r.percent ?? '',
        fixedAmount: r.fixedAmount ?? '',
        delayDays: r.delayDays,
        categoryId: r.categoryId ? String(r.categoryId) : '',
      })),
    })),
  };
}

// ─── DistributionTable ───────────────────────────────────────────────────────

interface DistributionTableProps {
  trancheIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  accounts: Account[];
  categories: Category[];
  currency: string;
  trancheAmount: number;
}

function DistributionTable({
  trancheIndex, form, accounts, categories, currency, trancheAmount,
}: DistributionTableProps) {
  const rules: DistributionRuleFormValues[] =
    form.values.tranches[trancheIndex].distributionRules;
  const basePath = `tranches.${trancheIndex}.distributionRules`;

  const { totalDistributed, totalPercent, hasRemainder } = useMemo(() => {
    let fixedSum = 0;
    let hasRem = false;

    rules.forEach((r) => {
      if (r.valueMode === 'FixedAmount' && r.fixedAmount) {
        fixedSum += r.fixedAmount as number;
      } else if (r.valueMode === 'Percent' && r.percent) {
        fixedSum += (trancheAmount * (r.percent as number)) / 100;
      } else if (r.valueMode === 'Remainder') {
        hasRem = true;
      }
    });

    const remainderAmount = hasRem ? trancheAmount - fixedSum : 0;
    const total = fixedSum + remainderAmount;
    const pct = trancheAmount > 0 ? Math.round((total / trancheAmount) * 100) : 0;

    return { totalDistributed: total, totalPercent: pct, hasRemainder: hasRem };
  }, [rules, trancheAmount]);

  const calcRuleAmount = (rule: DistributionRuleFormValues): number | null => {
    if (!trancheAmount) return null;
    if (rule.valueMode === 'Percent' && rule.percent) {
      return (trancheAmount * (rule.percent as number)) / 100;
    }
    if (rule.valueMode === 'FixedAmount' && rule.fixedAmount) {
      return rule.fixedAmount as number;
    }
    if (rule.valueMode === 'Remainder') {
      let used = 0;
      rules.forEach((r) => {
        if (r.valueMode === 'FixedAmount' && r.fixedAmount) used += r.fixedAmount as number;
        else if (r.valueMode === 'Percent' && r.percent)
          used += (trancheAmount * (r.percent as number)) / 100;
      });
      return trancheAmount - used;
    }
    return null;
  };

  const addRule = () => {
    const available = accounts.filter(
      (a) => !a.isArchived && !rules.some((r) => r.accountId === a.id),
    );
    if (available.length === 0) return;
    const hasRemainderRule = rules.some((r) => r.valueMode === 'Remainder');
    const newRule: DistributionRuleFormValues = {
      accountId: available[0].id,
      valueMode: rules.length === 0 ? 'Remainder' : hasRemainderRule ? 'Percent' : 'Remainder',
      percent: '',
      fixedAmount: '',
      delayDays: 0,
      categoryId: '',
    };
    form.setFieldValue(basePath, [...rules, newRule]);
  };

  const removeRule = (idx: number) => {
    form.setFieldValue(basePath, rules.filter((_: unknown, i: number) => i !== idx));
  };

  const usedIds = new Set(rules.map((r) => r.accountId));
  const availableForAdd = accounts
    .filter((a) => !a.isArchived && !usedIds.has(a.id))
    .map((a) => ({ value: String(a.id), label: a.name }));

  const categoryData = [
    { value: '', label: 'Без категории' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const progressColor =
    totalPercent === 100 ? 'green' : totalPercent > 100 ? 'red' : 'blue';

  return (
    <Stack gap="xs">
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
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Stack gap={2} style={{ flex: '0 0 150px' }}>
                      <Text fz="xs" c="dimmed">Счёт</Text>
                      <Text fz="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                        {account?.name ?? `Счёт #${rule.accountId}`}
                      </Text>
                    </Stack>

                    <Stack gap={2} style={{ flex: '0 0 auto' }}>
                      <Text fz="xs" c="dimmed">Режим</Text>
                      <SegmentedControl
                        size="xs"
                        data={[
                          { label: '%', value: 'Percent' },
                          { label: 'Сумма', value: 'FixedAmount' },
                          { label: 'Остаток', value: 'Remainder' },
                        ]}
                        value={rule.valueMode}
                        onChange={(v) => {
                          form.setFieldValue(`${rulePath}.valueMode`, v as DistributionValueMode);
                          form.setFieldValue(`${rulePath}.percent`, '');
                          form.setFieldValue(`${rulePath}.fixedAmount`, '');
                        }}
                      />
                    </Stack>

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
                        <Text fz="xs" c="dimmed" pt={4}>— всё остальное</Text>
                      )}
                    </Stack>

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

                    <Stack gap={2} style={{ flex: '0 0 100px' }} align="flex-end">
                      <Text fz="xs" c="dimmed">Сумма</Text>
                      <Text fz="sm" fw={700} c={ruleAmount !== null ? 'green' : 'dimmed'}>
                        {ruleAmount !== null ? formatMoney(ruleAmount, currency) : '—'}
                      </Text>
                    </Stack>

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

      {rules.length > 0 && (
        <Paper
          p="sm"
          radius="sm"
          bg={totalPercent === 100 ? 'green.0' : totalPercent > 100 ? 'red.0' : 'blue.0'}
          style={{ border: `1px solid var(--mantine-color-${progressColor}-3)` }}
        >
          <Group justify="space-between" mb="xs">
            <Text fz="sm" fw={600}>
              Распределено: {formatMoney(totalDistributed, currency)}
              {hasRemainder && ' (с остатком)'}
            </Text>
            <Group gap="xs">
              <Text fz="sm" fw={700} c={progressColor}>{totalPercent}%</Text>
              {totalPercent === 100 && <Text fz="sm" c="green">✓</Text>}
            </Group>
          </Group>
          <Progress value={Math.min(totalPercent, 100)} color={progressColor} size="sm" radius="xl" />
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

// ─── Main modal component ────────────────────────────────────────────────────

interface IncomeSourceFormModalProps {
  opened: boolean;
  onClose: () => void;
  initial?: IncomeSource;
  accounts: Account[];
  categories: Category[];
  onSave: (saved: IncomeSource) => void;
}

export function IncomeSourceFormModal({
  opened, onClose, initial, accounts, categories, onSave,
}: IncomeSourceFormModalProps) {
  const [loading, setLoading] = useState(false);

  const defaultTranche = (): TrancheFormValues => ({
    name: 'Основная выплата',
    dayOfMonth: 25,
    amountMode: 'Fixed',
    fixedAmount: '',
    percentOfTotal: '',
    distributionRules:
      accounts.filter((a) => !a.isArchived).length === 1
        ? [{
            accountId: accounts.filter((a) => !a.isArchived)[0].id,
            valueMode: 'Remainder' as DistributionValueMode,
            percent: '',
            fixedAmount: '',
            delayDays: 0,
            categoryId: '',
          }]
        : [],
  });

  const form = useForm<IncomeSourceFormValues>({
    initialValues: initial
      ? mapSourceToFormValues(initial)
      : {
          name: '',
          currency: 'RUB',
          expectedTotal: '',
          description: '',
          tranches: [defaultTranche()],
        },
    validate: {
      name: (v) => (!v.trim() ? 'Введите название' : null),
      currency: (v) => (!v ? 'Выберите валюту' : null),
      expectedTotal: (v) =>
        !v || (v as number) <= 0 ? 'Введите сумму больше 0' : null,
      tranches: {
        name: (v) => (!v.trim() ? 'Введите название транша' : null),
        dayOfMonth: (v) => {
          const n = v as number;
          if (v === '') return 'Введите день';
          if (n !== -1 && (n < 1 || n > 31)) return 'День от 1 до 31 (или -1)';
          return null;
        },
        fixedAmount: (v, values, path) => {
          const idx = Number((path as string).split('.')[1]);
          const mode = (values as IncomeSourceFormValues).tranches[idx]?.amountMode;
          if (mode === 'PercentOfTotal') return null;
          if (!v || (v as number) <= 0) return 'Введите сумму больше 0';
          return null;
        },
        percentOfTotal: (v, values, path) => {
          const idx = Number((path as string).split('.')[1]);
          const mode = (values as IncomeSourceFormValues).tranches[idx]?.amountMode;
          if (mode !== 'PercentOfTotal') return null;
          const n = v as number;
          if (!n || n <= 0) return 'Введите процент';
          if (n > 100) return 'Максимум 100%';
          return null;
        },
      },
    },
  });

  const addTranche = () => {
    form.setFieldValue('tranches', [...form.values.tranches, defaultTranche()]);
  };

  const removeTranche = (idx: number) => {
    form.setFieldValue('tranches', form.values.tranches.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (values: IncomeSourceFormValues) => {
    setLoading(true);
    try {
      const dto = {
        name: values.name,
        currency: values.currency,
        expectedTotal: values.expectedTotal as number,
        isActive: true,
        description: values.description || undefined,
        tranches: values.tranches.map((t) => ({
          id: t.id,
          name: t.name,
          dayOfMonth: t.dayOfMonth as number,
          amountMode: t.amountMode,
          fixedAmount:
            t.amountMode !== 'PercentOfTotal' && t.fixedAmount !== ''
              ? (t.fixedAmount as number)
              : undefined,
          percentOfTotal:
            t.amountMode === 'PercentOfTotal' && t.percentOfTotal !== ''
              ? (t.percentOfTotal as number)
              : undefined,
          distributionRules: t.distributionRules.map((r) => ({
            accountId: r.accountId,
            valueMode: r.valueMode,
            percent: r.percent !== '' ? (r.percent as number) : undefined,
            fixedAmount: r.fixedAmount !== '' ? (r.fixedAmount as number) : undefined,
            delayDays: r.delayDays !== '' ? (r.delayDays as number) : 0,
            categoryId: r.categoryId ? Number(r.categoryId) : undefined,
          })),
        })),
      };

      const result = initial
        ? await updateIncomeSource(initial.id, dto)
        : await createIncomeSource(dto);

      onSave(result);
      onClose();
      notifications.show({
        title: 'Успешно',
        message: initial ? 'Источник обновлён' : 'Источник создан',
        color: 'green',
      });
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
      title={initial ? `Редактировать: ${initial.name}` : 'Новый источник дохода'}
      size="xl"
      closeOnClickOutside={false}
      overlayProps={{ blur: 3 }}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          {/* ── Основное ── */}
          <Divider label="Основное" labelPosition="left" />
          <Group grow>
            <TextInput
              label="Название"
              required
              placeholder="Например: Зарплата"
              {...form.getInputProps('name')}
            />
            <Select
              label="Валюта"
              required
              data={CURRENCIES}
              {...form.getInputProps('currency')}
            />
          </Group>
          <NumberInput
            label="Общая сумма / мес"
            required
            min={0.01}
            thousandSeparator=" "
            decimalSeparator=","
            suffix={` ${form.values.currency}`}
            {...form.getInputProps('expectedTotal')}
          />
          <Textarea
            label="Описание"
            placeholder="Необязательно"
            rows={2}
            {...form.getInputProps('description')}
          />

          {/* ── Транши ── */}
          <Divider label="Транши" labelPosition="left" />
          <Accordion multiple variant="separated">
            {form.values.tranches.map((tranche, index) => {
              const trancheAmountNum =
                tranche.amountMode === 'PercentOfTotal'
                  ? tranche.percentOfTotal !== '' && form.values.expectedTotal !== ''
                    ? ((tranche.percentOfTotal as number) / 100) * (form.values.expectedTotal as number)
                    : 0
                  : tranche.fixedAmount !== ''
                  ? (tranche.fixedAmount as number)
                  : 0;

              const trancheAmountLabel =
                trancheAmountNum > 0
                  ? formatMoney(trancheAmountNum, form.values.currency)
                  : '—';

              return (
                <Accordion.Item key={index} value={String(index)}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" style={{ flex: 1, paddingRight: 8 }}>
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
                        <Text fz="sm" fw={600} c="green">{trancheAmountLabel}</Text>
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

                      <div>
                        <Text fz="sm" fw={500} mb={4}>Режим суммы</Text>
                        <SegmentedControl
                          data={[
                            { label: 'Фиксированная', value: 'Fixed' },
                            { label: '% от общей', value: 'PercentOfTotal' },
                            { label: 'Примерная', value: 'Estimated' },
                          ]}
                          value={tranche.amountMode}
                          onChange={(v) => {
                            form.setFieldValue(`tranches.${index}.amountMode`, v as AmountMode);
                            if (v === 'PercentOfTotal' && form.values.tranches.length === 1) {
                              form.setFieldValue(`tranches.${index}.percentOfTotal`, 100);
                            }
                          }}
                        />
                      </div>

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
                          <Stack gap={2} pt={24}>
                            <Text fz="sm" c="dimmed">= </Text>
                            <Text fz="sm" fw={600} c="green">
                              {tranche.percentOfTotal && form.values.expectedTotal
                                ? formatMoney(
                                    ((tranche.percentOfTotal as number) / 100) *
                                      (form.values.expectedTotal as number),
                                    form.values.currency,
                                  )
                                : '—'}
                            </Text>
                          </Stack>
                        </Group>
                      ) : (
                        <NumberInput
                          label={
                            tranche.amountMode === 'Estimated' ? 'Примерная сумма' : 'Фиксированная сумма'
                          }
                          description={
                            tranche.amountMode === 'Estimated'
                              ? 'Будет уточнена при подтверждении'
                              : undefined
                          }
                          required
                          min={0.01}
                          thousandSeparator=" "
                          decimalSeparator=","
                          suffix={` ${form.values.currency}`}
                          {...form.getInputProps(`tranches.${index}.fixedAmount`)}
                        />
                      )}

                      <Divider label="Распределение по счетам" labelPosition="left" />
                      <DistributionTable
                        trancheIndex={index}
                        form={form}
                        accounts={accounts}
                        categories={categories}
                        currency={form.values.currency}
                        trancheAmount={trancheAmountNum}
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>

          <Button
            variant="outline"
            size="sm"
            style={{ borderStyle: 'dashed' }}
            onClick={addTranche}
          >
            + Добавить транш
          </Button>

          <Divider />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={loading}>Отмена</Button>
            <Button type="submit" loading={loading}>Сохранить</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
