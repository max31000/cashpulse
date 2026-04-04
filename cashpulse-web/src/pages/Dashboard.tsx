import { useEffect } from 'react';
import {
  Grid, Paper, Text, Stack, Group, Skeleton, Badge, Progress,
  Divider, Anchor, ActionIcon, Accordion, Table
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAccountStore } from '../store/useAccountStore';
import { useForecastStore } from '../store/useForecastStore';
import { useOperationStore } from '../store/useOperationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ForecastChart } from '../components/ForecastChart/ForecastChart';
import { AlertsPanel } from '../components/AlertsPanel/AlertsPanel';
import { confirmOperation } from '../api/operations';
import { formatMoney, formatMoneyWithSign } from '../utils/formatMoney';
import { formatDateFull, formatDateCompact, toISODateString, formatMonth } from '../utils/formatDate';
import { accountTypeColors, accountTypeLabels, tagColor } from '../utils/colors';

export default function Dashboard() {
  const navigate = useNavigate();
  const { accounts, loading: accLoading, fetch: fetchAccounts } = useAccountStore();
  const { forecast, loading: fcLoading, horizon, fetch: fetchForecast, setHorizon } = useForecastStore();
  const { operations, loading: opLoading, fetch: fetchOps } = useOperationStore();
  const { baseCurrency } = useSettingsStore();

  useEffect(() => {
    void fetchAccounts();
    void fetchForecast();
    const today = toISODateString(new Date());
    const futureDate = toISODateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    void fetchOps({ from: today, to: futureDate, isConfirmed: false, limit: 7 });
  }, []);

  // Net Worth calculation
  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const netWorth = activeAccounts.reduce((sum, acc) => {
    const rubBalance = acc.balances.find((b) => b.currency === baseCurrency);
    return sum + (rubBalance?.amount ?? 0);
  }, 0);

  // Latest net worth from forecast
  const latestNetWorth = forecast?.netWorth?.at(-1)?.amount;
  const prevNetWorth = forecast?.netWorth?.[0]?.amount;
  const delta30 = latestNetWorth != null && prevNetWorth != null ? latestNetWorth - prevNetWorth : null;

  const today = new Date();
  const upcomingOps = operations
    .filter((op) => {
      const opDate = op.operationDate ? new Date(op.operationDate) : null;
      return opDate && opDate >= today && !op.isConfirmed;
    })
    .sort((a, b) => (a.operationDate ?? '').localeCompare(b.operationDate ?? ''))
    .slice(0, 7);

  const handleConfirm = async (id: number) => {
    try {
      await confirmOperation(id);
      void fetchOps();
      notifications.show({ title: 'Подтверждено', message: 'Операция подтверждена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  return (
      <Grid>
      {/* Left column */}
      <Grid.Col span={{ base: 12, sm: 8 }}>
        <Stack gap="md">
          {/* Net Worth */}
          <Paper p="lg" shadow="sm" withBorder>
            {accLoading ? (
              <Stack gap="xs">
                <Skeleton h={40} width="60%" />
                <Skeleton h={20} width="40%" />
                <Skeleton h={20} width="30%" />
              </Stack>
            ) : (
              <>
                <Text fz="sm" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                  Чистый капитал
                </Text>
                <Text fz={42} fw={700} c="blue" lh={1.2} mt={4}>
                  {formatMoney(netWorth, baseCurrency)}
                </Text>
                <Text fz="sm" c="dimmed" mt={4}>
                  На сегодня, {formatDateFull(new Date())}
                </Text>
                {delta30 != null && (
                  <Text fz="sm" c={delta30 >= 0 ? 'green' : 'red'} mt={4}>
                    {delta30 >= 0 ? '↑' : '↓'} {formatMoneyWithSign(delta30, baseCurrency)} за 30 дней
                  </Text>
                )}
              </>
            )}
          </Paper>

          {/* Forecast Chart */}
          <ForecastChart
            forecast={forecast}
            loading={fcLoading}
            horizon={horizon}
            onHorizonChange={setHorizon}
            baseCurrency={baseCurrency}
          />

          {/* Monthly Table */}
          <Paper p="lg" withBorder radius="md">
            <Text fz="sm" fw={600} c="dimmed" tt="uppercase" mb="md">По месяцам</Text>
            {fcLoading ? (
              <Stack gap="xs">
                {[1,2,3,4,5,6].map(i => <Skeleton key={i} h={40} />)}
              </Stack>
            ) : !forecast?.monthlyBreakdown?.length ? (
              <Text c="dimmed" ta="center" py="md">Нет данных</Text>
            ) : (
              <Accordion variant="default" chevronPosition="left">
                {forecast.monthlyBreakdown.map((mb) => (
                  <Accordion.Item key={mb.month} value={mb.month}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm" fw={500} w={120}>{formatMonth(mb.month)}</Text>
                        <Text fz="sm" c="green" fw={600}>{formatMoney(mb.income, baseCurrency)}</Text>
                        <Text fz="sm" c="red" fw={600}>{formatMoney(mb.expense, baseCurrency)}</Text>
                        <Text fz="sm" fw={700} c={mb.endBalance >= 0 ? 'green' : 'red'}>
                          {formatMoney(mb.endBalance, baseCurrency)}
                        </Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Table fz="xs" pl="lg">
                        <Table.Tbody>
                          {Object.entries(mb.byCategory).map(([catId, amount]) => (
                            <Table.Tr key={catId}>
                              <Table.Td c="dimmed">Категория {catId}</Table.Td>
                              <Table.Td ta="right">{formatMoney(amount, baseCurrency)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Paper>
        </Stack>
      </Grid.Col>

      {/* Right column */}
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Stack gap="md">
          {/* Alerts */}
          <AlertsPanel alerts={forecast?.alerts ?? []} loading={fcLoading} />

          {/* Upcoming Operations */}
          <Paper p="md" withBorder radius="md">
            <Text fz="sm" fw={600} c="dimmed" tt="uppercase" mb="sm">Ближайшие операции</Text>
            {opLoading ? (
              <Stack gap="xs">
                {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} h={36} />)}
              </Stack>
            ) : upcomingOps.length === 0 ? (
              <Text c="dimmed" fz="sm" ta="center" py="md">Нет ближайших операций</Text>
            ) : (
              <Stack gap={4}>
                {upcomingOps.map((op) => (
                  <div key={op.id}>
                    <Group justify="space-between" wrap="nowrap" py={4}>
                      <Group gap="xs" wrap="nowrap" style={{ flex: 1, overflow: 'hidden' }}>
                        <Text fz="xs" c="dimmed" w={45} style={{ flexShrink: 0 }}>
                          {op.operationDate ? formatDateCompact(op.operationDate) : '—'}
                        </Text>
                        <Text fz="sm" fw={500} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {op.description ?? `Операция #${op.id}`}
                        </Text>
                        {op.tags?.[0] && (
                          <Badge size="xs" variant="dot" color={tagColor(op.tags[0])}>{op.tags[0]}</Badge>
                        )}
                        {op.recurrenceRuleId && <Text fz="xs" c="dimmed">🔁</Text>}
                      </Group>
                      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                        <Text fz="sm" fw={700} c={op.amount >= 0 ? 'green' : 'red'}>
                          {formatMoneyWithSign(op.amount, op.currency)}
                        </Text>
                        <ActionIcon
                          variant="subtle"
                          color="green"
                          size="sm"
                          title="Подтвердить"
                          onClick={() => handleConfirm(op.id)}
                        >
                          ✓
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Divider my={2} />
                  </div>
                ))}
                <Anchor fz="xs" c="blue" mt="xs" onClick={() => navigate('/operations')}>
                  Все операции →
                </Anchor>
              </Stack>
            )}
          </Paper>

          {/* Accounts Summary */}
          <Paper p="md" withBorder radius="md">
            <Text fz="sm" fw={600} c="dimmed" tt="uppercase" mb="sm">Счета</Text>
            {accLoading ? (
              <Stack gap="xs">
                {[1,2,3].map(i => <Skeleton key={i} h={80} />)}
              </Stack>
            ) : activeAccounts.length === 0 ? (
              <Stack align="center" py="md" gap="xs">
                <Text fz="2xl">🏦</Text>
                <Text c="dimmed" fz="sm">Нет счетов</Text>
                <Anchor fz="xs" c="blue" onClick={() => navigate('/accounts')}>Добавить счёт</Anchor>
              </Stack>
            ) : (
              <Stack gap="xs">
                {activeAccounts.map((acc) => {
                  const mainBalance = acc.balances[0];
                  const otherBalances = acc.balances.slice(1);
                  const usedPercent = acc.type === 'credit' && acc.creditLimit
                    ? (Math.abs(mainBalance?.amount ?? 0) / acc.creditLimit) * 100
                    : 0;
                  const dueDay = acc.dueDay;
                  let daysLeft = 0;
                  if (dueDay) {
                    const now = new Date();
                    const nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
                    if (nextDue < now) nextDue.setMonth(nextDue.getMonth() + 1);
                    daysLeft = Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  }

                  return (
                    <Paper
                      key={acc.id}
                      p="sm"
                      withBorder
                      radius="sm"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/accounts/${acc.id}`)}
                    >
                      <Group justify="space-between" mb={4}>
                        <Text fw={600} fz="sm">{acc.name}</Text>
                        <Badge size="xs" color={accountTypeColors[acc.type]}>
                          {accountTypeLabels[acc.type]}
                        </Badge>
                      </Group>
                      <Text fz="lg" fw={700} c={mainBalance?.amount < 0 ? 'red' : undefined}>
                        {mainBalance ? formatMoney(mainBalance.amount, mainBalance.currency) : '—'}
                      </Text>
                      {otherBalances.map((b) => (
                        <Text key={b.currency} fz="sm" c="dimmed">
                          {formatMoney(b.amount, b.currency)}
                        </Text>
                      ))}
                      {acc.type === 'credit' && acc.creditLimit && (
                        <>
                          <Progress
                            value={usedPercent}
                            color={usedPercent > 80 ? 'red' : 'blue'}
                            size="sm"
                            mt="xs"
                          />
                          <Text fz="xs" c="dimmed" mt={2}>
                            Использовано: {usedPercent.toFixed(0)}%
                          </Text>
                          {dueDay && (
                            <Text fz="xs" c={daysLeft <= 7 ? 'red' : 'dimmed'}>
                              До оплаты: {daysLeft} дней
                            </Text>
                          )}
                        </>
                      )}
                    </Paper>
                  );
                })}
                <Anchor fz="xs" c="blue" mt="xs" onClick={() => navigate('/accounts')}>
                  Управление счетами →
                </Anchor>
              </Stack>
            )}
          </Paper>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
