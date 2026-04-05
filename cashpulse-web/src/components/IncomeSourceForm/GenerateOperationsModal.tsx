import { useState, useEffect } from 'react';
import {
  Modal, Stack, Group, Button, SegmentedControl, Text,
  Divider, Alert, Paper, Table,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import type { Account, IncomeSource, GeneratedOpDto, GeneratePreviewResponse } from '../../api/types';
import { generateOperations } from '../../api/incomeSources';
import { formatMoney } from '../../utils/formatMoney';
import { formatDateCompact, toISODateString } from '../../utils/formatDate';

interface GenerateOperationsModalProps {
  opened: boolean;
  onClose: () => void;
  source: IncomeSource;
  accounts: Account[];
}

// MonthPickerInput in Mantine v9 returns string | null (YYYY-MM-DD of first day)
// We work with string values and parse them as needed.

function getMonthRange(fromStr: string, toStr: string): string[] {
  const months: string[] = [];
  const [fy, fm] = fromStr.split('-').map(Number);
  const [ty, tm] = toStr.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function monthStrToRange(monthStr: string): { from: string; to: string } {
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { from: toISODateString(first), to: toISODateString(last) };
}

export function GenerateOperationsModal({
  opened, onClose, source, accounts,
}: GenerateOperationsModalProps) {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  // MonthPickerInput v9 gives us a string like "2026-04-01" or null
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [month, setMonth] = useState<string | null>(currentMonthStr);
  const [rangeFrom, setRangeFrom] = useState<string | null>(currentMonthStr);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedOpDto[] | null>(null);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset preview on period change
  useEffect(() => { setPreview(null); }, [mode, month, rangeFrom, rangeTo]);

  const buildDateRange = (): { from: string; to: string } | null => {
    if (mode === 'single') {
      if (!month) return null;
      // month is like "2026-04-01"
      const ym = month.substring(0, 7); // "2026-04"
      return monthStrToRange(ym);
    } else {
      if (!rangeFrom || !rangeTo) return null;
      const ymFrom = rangeFrom.substring(0, 7);
      const ymTo = rangeTo.substring(0, 7);
      const months = getMonthRange(ymFrom, ymTo);
      if (months.length === 0) return null;
      const fromRange = monthStrToRange(months[0]);
      const toRange = monthStrToRange(months[months.length - 1]);
      return { from: fromRange.from, to: toRange.to };
    }
  };

  const handlePreview = async () => {
    const range = buildDateRange();
    if (!range) return;
    setLoading(true);
    try {
      const result = await generateOperations(source.id, {
        ...range,
        preview: true,
      });
      const ops = (result as GeneratePreviewResponse).operations ?? [];
      setPreview(ops);
      setHasDuplicates(ops.some((op) => op.isDuplicate));
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    const range = buildDateRange();
    if (!range) return;
    setLoading(true);
    try {
      const result = await generateOperations(source.id, {
        ...range,
        preview: false,
      });
      const created = (result as { created: number; skipped: number }).created ?? 0;
      notifications.show({
        title: 'Готово',
        message: `Создано ${created} операций`,
        color: 'green',
      });
      onClose();
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const accountName = (id: number) =>
    accounts.find((a) => a.id === id)?.name ?? `#${id}`;

  const nonDuplicates = preview ? preview.filter((op) => !op.isDuplicate) : [];

  // Build minDate string for "To" picker
  const rangeToMinDate = rangeFrom
    ? new Date(rangeFrom.substring(0, 7) + '-01')
    : undefined;

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
            maxDate={new Date(now.getFullYear() + 1, 11, 31)}
          />
        ) : (
          <Group grow>
            <MonthPickerInput
              label="С"
              value={rangeFrom}
              onChange={setRangeFrom}
              required
            />
            <MonthPickerInput
              label="По"
              value={rangeTo}
              onChange={setRangeTo}
              required
              minDate={rangeToMinDate}
            />
          </Group>
        )}

        {preview !== null && (
          <Stack gap="xs">
            {hasDuplicates && (
              <Alert color="orange" title="Возможные дубликаты">
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
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((row, i) => (
                    <Table.Tr key={i} style={{ opacity: row.isDuplicate ? 0.5 : 1 }}>
                      <Table.Td c="dimmed">{formatDateCompact(row.date)}</Table.Td>
                      <Table.Td fw={500}>{accountName(row.accountId)}</Table.Td>
                      <Table.Td c="dimmed">{row.trancheName}</Table.Td>
                      <Table.Td ta="right" fw={700} c="green">
                        +{formatMoney(row.amount, source.currency)}
                        {row.isDuplicate && (
                          <Text component="span" fz="xs" c="orange"> *</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>

            <Text fz="sm" fw={600}>
              Итого: {nonDuplicates.length} операций ·{' '}
              {formatMoney(
                nonDuplicates.reduce((s, op) => s + op.amount, 0),
                source.currency,
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
              disabled={nonDuplicates.length === 0}
            >
              Создать {nonDuplicates.length} операций
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
