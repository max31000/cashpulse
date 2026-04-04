import { Select, NumberInput, Checkbox, Group, Stack, Text } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';

export interface RecurrenceFormValues {
  recurrenceType: string;
  dayOfMonth: number | '';
  interval: number | '';
  daysOfWeek: string[];
  startDate: string;
  endDate: string;
  noEndDate: boolean;
}

interface Props {
  form: UseFormReturnType<RecurrenceFormValues>;
}

const RECURRENCE_TYPES = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'biweekly', label: 'Каждые 2 недели' },
  { value: 'monthly', label: 'Ежемесячно' },
  { value: 'quarterly', label: 'Ежеквартально' },
  { value: 'yearly', label: 'Ежегодно' },
  { value: 'custom', label: 'Произвольно (N дней)' },
];

const WEEKDAYS = [
  { value: '1', label: 'Пн' },
  { value: '2', label: 'Вт' },
  { value: '3', label: 'Ср' },
  { value: '4', label: 'Чт' },
  { value: '5', label: 'Пт' },
  { value: '6', label: 'Сб' },
  { value: '7', label: 'Вс' },
];

export function RecurrenceRuleForm({ form }: Props) {
  const type = form.values.recurrenceType;
  const showDayOfMonth = ['monthly', 'quarterly', 'yearly'].includes(type);
  const showDaysOfWeek = ['weekly', 'biweekly'].includes(type);
  const showInterval = type === 'custom';

  return (
    <Stack gap="sm">
      <Select
        label="Тип повторения"
        required
        data={RECURRENCE_TYPES}
        {...form.getInputProps('recurrenceType')}
      />

      {showDayOfMonth && (
        <NumberInput
          label="День месяца"
          required
          min={-1}
          max={31}
          placeholder="-1 (последний день)"
          description="Введите -1 для последнего дня месяца"
          {...form.getInputProps('dayOfMonth')}
        />
      )}

      {showDaysOfWeek && (
        <Stack gap={4}>
          <Text fz="sm" fw={500}>Дни недели *</Text>
          <Group gap="xs">
            {WEEKDAYS.map((day) => (
              <Checkbox
                key={day.value}
                label={day.label}
                checked={form.values.daysOfWeek.includes(day.value)}
                onChange={(e) => {
                  const current = form.values.daysOfWeek;
                  if (e.currentTarget.checked) {
                    form.setFieldValue('daysOfWeek', [...current, day.value]);
                  } else {
                    form.setFieldValue('daysOfWeek', current.filter((d) => d !== day.value));
                  }
                }}
              />
            ))}
          </Group>
          {form.errors.daysOfWeek && (
            <Text fz="xs" c="red">{form.errors.daysOfWeek}</Text>
          )}
        </Stack>
      )}

      {showInterval && (
        <NumberInput
          label="Каждые N дней"
          required
          min={1}
          {...form.getInputProps('interval')}
        />
      )}

      <Group grow>
        <NumberInput
          label="Начальная дата (unix)"
          description="Формат: YYYY-MM-DD"
          placeholder="2026-04-05"
          {...form.getInputProps('startDate')}
        />
        <Stack gap={4}>
          <NumberInput
            label="Конечная дата"
            placeholder="YYYY-MM-DD"
            disabled={form.values.noEndDate}
            {...form.getInputProps('endDate')}
          />
          <Checkbox
            label="Бессрочно"
            checked={form.values.noEndDate}
            onChange={(e) => form.setFieldValue('noEndDate', e.currentTarget.checked)}
          />
        </Stack>
      </Group>
    </Stack>
  );
}
