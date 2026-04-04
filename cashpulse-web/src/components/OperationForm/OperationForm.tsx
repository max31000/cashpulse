import { useState } from 'react';
import {
  Modal, Stack, SegmentedControl, NumberInput, Select, TagsInput,
  TextInput, Switch, Group, Button, Text, Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { Account, Category, Scenario, PlannedOperation } from '../../api/types';
import { createOperation, updateOperation } from '../../api/operations';
import { toISODateString } from '../../utils/formatDate';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (op: PlannedOperation) => void;
  accounts: Account[];
  categories: Category[];
  scenarios: Scenario[];
  initialValues?: Partial<PlannedOperation>;
  fixedScenarioId?: number;
  fixedAccountId?: number;
}

interface FormValues {
  type: 'income' | 'expense';
  amount: number | '';
  currency: string;
  accountId: string;
  categoryId: string;
  tags: string[];
  description: string;
  operationDate: string;
  scenarioId: string;
  isRecurring: boolean;
  recurrenceType: string;
  dayOfMonth: number | '';
  interval: number | '';
  daysOfWeek: string[];
  startDate: string;
  endDate: string;
  noEndDate: boolean;
}

export function OperationForm({
  opened, onClose, onSave, accounts, categories, scenarios,
  initialValues, fixedScenarioId, fixedAccountId
}: Props) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!initialValues?.id;
  const today = toISODateString(new Date());

  const form = useForm<FormValues>({
    initialValues: {
      type: (initialValues?.amount ?? 0) >= 0 ? 'income' : 'expense',
      amount: initialValues?.amount != null ? Math.abs(initialValues.amount) : '',
      currency: initialValues?.currency ?? 'RUB',
      accountId: initialValues?.accountId ? String(initialValues.accountId) : (fixedAccountId ? String(fixedAccountId) : ''),
      categoryId: initialValues?.categoryId ? String(initialValues.categoryId) : '',
      tags: initialValues?.tags ?? [],
      description: initialValues?.description ?? '',
      operationDate: initialValues?.operationDate ?? today,
      scenarioId: initialValues?.scenarioId != null ? String(initialValues.scenarioId) : (fixedScenarioId != null ? String(fixedScenarioId) : ''),
      isRecurring: !!initialValues?.recurrenceRuleId,
      recurrenceType: initialValues?.recurrenceRule?.type ?? 'monthly',
      dayOfMonth: initialValues?.recurrenceRule?.dayOfMonth ?? '',
      interval: initialValues?.recurrenceRule?.interval ?? '',
      daysOfWeek: initialValues?.recurrenceRule?.daysOfWeek?.map(String) ?? [],
      startDate: initialValues?.recurrenceRule?.startDate ?? today,
      endDate: initialValues?.recurrenceRule?.endDate ?? '',
      noEndDate: !initialValues?.recurrenceRule?.endDate,
    },
    validate: {
      amount: (v) => (!v || v <= 0) ? 'Введите сумму больше 0' : null,
      accountId: (v) => !v ? 'Выберите счёт' : null,
      operationDate: (v, values) => (!values.isRecurring && !v) ? 'Введите дату' : null,
      startDate: (v, values) => (values.isRecurring && !v) ? 'Введите начальную дату' : null,
      daysOfWeek: (v, values) =>
        values.isRecurring && ['weekly', 'biweekly'].includes(values.recurrenceType) && v.length === 0
          ? 'Выберите хотя бы один день' : null,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const amount = values.type === 'expense' ? -(values.amount as number) : (values.amount as number);
      const dto = {
        accountId: Number(values.accountId),
        amount,
        currency: values.currency,
        categoryId: values.categoryId ? Number(values.categoryId) : undefined,
        tags: values.tags.map((t) => t.trim().toLowerCase()),
        description: values.description || undefined,
        operationDate: values.isRecurring ? undefined : values.operationDate,
        scenarioId: values.scenarioId ? Number(values.scenarioId) : undefined,
        recurrenceRule: values.isRecurring ? {
          type: values.recurrenceType as PlannedOperation['recurrenceRule'] extends infer R ? R extends { type: infer T } ? T : never : never,
          dayOfMonth: values.dayOfMonth !== '' ? values.dayOfMonth as number : undefined,
          interval: values.interval !== '' ? values.interval as number : undefined,
          daysOfWeek: values.daysOfWeek.length > 0 ? values.daysOfWeek.map(Number) : undefined,
          startDate: values.startDate,
          endDate: values.noEndDate ? undefined : (values.endDate || undefined),
        } : undefined,
      };

      let result: PlannedOperation;
      if (isEdit && initialValues?.id) {
        result = await updateOperation(initialValues.id, dto);
      } else {
        result = await createOperation(dto);
      }
      onSave(result);
      onClose();
      notifications.show({
        title: 'Успешно',
        message: isEdit ? 'Операция обновлена' : 'Операция создана',
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        title: 'Ошибка',
        message: (e as Error).message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const accountData = activeAccounts.map((a) => ({ value: String(a.id), label: a.name }));
  const categoryData = categories.map((c) => ({
    value: String(c.id),
    label: c.parentId ? `  └ ${c.name}` : c.name,
    group: c.parentId ? undefined : c.name,
  }));
  const scenarioData = [
    { value: '', label: 'Базовый план' },
    ...scenarios.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Редактировать операцию' : 'Новая операция'}
      size="lg"
      closeOnClickOutside={false}
      overlayProps={{ blur: 3 }}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <SegmentedControl
            data={[
              { label: 'Доход', value: 'income' },
              { label: 'Расход', value: 'expense' },
            ]}
            {...form.getInputProps('type')}
            color={form.values.type === 'income' ? 'green' : 'red'}
          />

          <Group grow>
            <NumberInput
              label="Сумма"
              required
              min={0.01}
              step={100}
              thousandSeparator=" "
              decimalSeparator=","
              {...form.getInputProps('amount')}
            />
            <Select
              label="Валюта"
              required
              searchable
              data={['RUB', 'USD', 'EUR', 'CNY', 'BYR', 'GBP']}
              {...form.getInputProps('currency')}
            />
          </Group>

          <Group grow>
            <Select
              label="Счёт"
              required
              searchable
              data={accountData}
              disabled={!!fixedAccountId}
              {...form.getInputProps('accountId')}
            />
            <Select
              label="Категория"
              searchable
              clearable
              data={categoryData}
              {...form.getInputProps('categoryId')}
            />
          </Group>

          <Group grow>
            <TagsInput
              label="Теги"
              maxTags={10}
              {...form.getInputProps('tags')}
            />
            <TextInput
              label="Описание"
              maxLength={500}
              placeholder="Комментарий к операции"
              {...form.getInputProps('description')}
            />
          </Group>

          <Switch
            label="Повторяющаяся операция"
            size="sm"
            {...form.getInputProps('isRecurring', { type: 'checkbox' })}
          />

          {!form.values.isRecurring && (
            <TextInput
              label="Дата"
              required
              type="date"
              {...form.getInputProps('operationDate')}
            />
          )}

          {form.values.isRecurring && (
            <>
              <Divider label="Правило повторения" />
              <Select
                label="Тип повторения"
                required
                data={[
                  { value: 'daily', label: 'Ежедневно' },
                  { value: 'weekly', label: 'Еженедельно' },
                  { value: 'biweekly', label: 'Каждые 2 недели' },
                  { value: 'monthly', label: 'Ежемесячно' },
                  { value: 'quarterly', label: 'Ежеквартально' },
                  { value: 'yearly', label: 'Ежегодно' },
                  { value: 'custom', label: 'Произвольно (N дней)' },
                ]}
                {...form.getInputProps('recurrenceType')}
              />
              {['monthly', 'quarterly', 'yearly'].includes(form.values.recurrenceType) && (
                <NumberInput
                  label="День месяца"
                  required
                  min={-1}
                  max={31}
                  placeholder="-1 (последний день)"
                  {...form.getInputProps('dayOfMonth')}
                />
              )}
              {form.values.recurrenceType === 'custom' && (
                <NumberInput
                  label="Каждые N дней"
                  required
                  min={1}
                  {...form.getInputProps('interval')}
                />
              )}
              <Group grow>
                <TextInput
                  label="Начальная дата"
                  required
                  type="date"
                  {...form.getInputProps('startDate')}
                />
                <Stack gap={4}>
                  <TextInput
                    label="Конечная дата"
                    type="date"
                    disabled={form.values.noEndDate}
                    {...form.getInputProps('endDate')}
                  />
                  <Text
                    fz="xs"
                    c="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => form.setFieldValue('noEndDate', !form.values.noEndDate)}
                  >
                    {form.values.noEndDate ? '☑ Бессрочно' : '☐ Бессрочно'}
                  </Text>
                </Stack>
              </Group>
            </>
          )}

          <Select
            label="Сценарий"
            data={scenarioData}
            disabled={fixedScenarioId != null}
            description="Операции в сценарии включаются в прогноз только при активном сценарии"
            {...form.getInputProps('scenarioId')}
          />

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
