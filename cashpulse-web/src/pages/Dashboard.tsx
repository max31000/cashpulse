import { useEffect } from 'react';
import { Accordion, ActionIcon, Badge, Progress, Skeleton, Table, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { EmptyState, ErrorState, Metric, MetricGrid, Page, Section } from '@mvv42/kit';
import { IconBuildingBank, IconCalendarEvent, IconCheck, IconRepeat } from '@tabler/icons-react';
import { useAccountStore } from '../store/useAccountStore';
import { useForecastStore } from '../store/useForecastStore';
import { useOperationStore } from '../store/useOperationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ForecastChart } from '../components/ForecastChart/ForecastChart';
import { AlertsPanel } from '../components/AlertsPanel/AlertsPanel';
import { confirmOperation } from '../api/operations';
import type { Account } from '../api/types';
import { formatMoney, formatMoneyWithSign } from '../utils/formatMoney';
import { formatDateFull, formatDateCompact, toISODateString, formatMonth } from '../utils/formatDate';
import { accountTypeLabels, tagColor } from '../utils/colors';
import { creditUsage, daysUntilDue } from '../utils/accounts';

function AccountRow({ acc }: { acc: Account }) {
  const main = acc.balances[0];
  const usedPercent = creditUsage(acc);
  const daysLeft = daysUntilDue(acc);
  return (
    <Link to={`/accounts/${acc.id}`} className="cp-acc-row">
      <span className="cp-acc-line">
        <span className="cp-acc-name cp-truncate">{acc.name}</span>
        <span className="cp-acc-balance mvv-num cp-amount" data-sign={main && main.amount < 0 ? 'neg' : undefined}>
          {main ? formatMoney(main.amount, main.currency) : '—'}
        </span>
      </span>
      <span className="cp-acc-line">
        <Text span fz="xs" c="dimmed">
          {accountTypeLabels[acc.type]}
          {usedPercent != null && ` · лимит ${usedPercent.toFixed(0)}%`}
          {daysLeft != null && (
            <Text span fz="xs" c={daysLeft <= 7 ? 'red' : 'dimmed'}>{` · оплата через ${daysLeft} дн.`}</Text>
          )}
        </Text>
        {acc.balances.length > 1 && (
          <Text span fz="xs" c="dimmed" className="mvv-num">
            {acc.balances.slice(1).map((b) => formatMoney(b.amount, b.currency)).join(' · ')}
          </Text>
        )}
      </span>
      {usedPercent != null && (
        <Progress value={usedPercent} color={usedPercent > 80 ? 'red' : 'blue'} size="xs" aria-label="Использование лимита" />
      )}
    </Link>
  );
}

export default function Dashboard() {
  const { accounts, loading: accLoading, error: accError, fetch: fetchAccounts } = useAccountStore();
  const { forecast, loading: fcLoading, error: fcError, horizon, fetch: fetchForecast, setHorizon } = useForecastStore();
  const { operations, loading: opLoading, fetch: fetchOps } = useOperationStore();
  const { baseCurrency } = useSettingsStore();

  const loadUpcoming = () => {
    const today = toISODateString(new Date());
    const futureDate = toISODateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    void fetchOps({ from: today, to: futureDate, isConfirmed: false, limit: 7 });
  };

  useEffect(() => {
    void fetchAccounts();
    void fetchForecast();
    loadUpcoming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const netWorth = activeAccounts.reduce((sum, acc) => {
    const balance = acc.balances.find((b) => b.currency === baseCurrency);
    return sum + (balance?.amount ?? 0);
  }, 0);

  // Forecast: first and last point of the horizon
  const endNetWorth = forecast?.netWorth?.at(-1)?.amount;
  const startNetWorth = forecast?.netWorth?.[0]?.amount;
  const horizonDelta = endNetWorth != null && startNetWorth != null ? endNetWorth - startNetWorth : null;

  const todayStr = toISODateString(new Date());
  const upcomingOps = operations
    .filter((op) => op.operationDate && op.operationDate >= todayStr && !op.isConfirmed)
    .sort((a, b) => (a.operationDate ?? '').localeCompare(b.operationDate ?? ''))
    .slice(0, 7);
  const upcomingTotal = upcomingOps
    .filter((op) => op.currency === baseCurrency)
    .reduce((sum, op) => sum + op.amount, 0);
  const criticalAlerts = forecast?.alerts?.filter((a) => a.severity === 'critical').length ?? 0;

  const handleConfirm = async (id: number) => {
    try {
      await confirmOperation(id);
      loadUpcoming();
      void fetchAccounts();
      notifications.show({ title: 'Подтверждено', message: 'Операция подтверждена', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Ошибка', message: (e as Error).message, color: 'red' });
    }
  };

  return (
    <Page title="Дашборд" description={`На сегодня, ${formatDateFull(new Date())}`} width="wide">
      <MetricGrid>
        <Metric label="Чистый капитал" value={formatMoney(netWorth, baseCurrency)} hint={`${activeAccounts.length} счетов`} loading={accLoading} />
        <Metric
          label={`Прогноз через ${horizon} мес.`}
          value={endNetWorth != null ? formatMoney(endNetWorth, baseCurrency) : '—'}
          delta={horizonDelta != null ? { value: formatMoneyWithSign(horizonDelta, baseCurrency), tone: horizonDelta > 0 ? 'positive' : horizonDelta < 0 ? 'negative' : 'neutral' } : undefined}
          hint={horizonDelta != null ? 'за горизонт' : undefined}
          loading={fcLoading}
        />
        <Metric
          label="Плановые на 30 дней"
          value={formatMoneyWithSign(upcomingTotal, baseCurrency)}
          hint={`${upcomingOps.length} операций`}
          loading={opLoading}
        />
        <Metric
          label="Предупреждения"
          value={String(forecast?.alerts?.length ?? 0)}
          hint={criticalAlerts > 0 ? `${criticalAlerts} критичных` : 'критичных нет'}
          loading={fcLoading}
        />
      </MetricGrid>

      <div className="cp-dashboard">
        <div className="cp-stack">
          <ForecastChart
            forecast={forecast}
            loading={fcLoading}
            error={fcError}
            onRetry={() => void fetchForecast()}
            horizon={horizon}
            onHorizonChange={setHorizon}
            baseCurrency={baseCurrency}
          />

          <Section title="По месяцам" description="Доходы, расходы и баланс на конец месяца" padding="none">
            {fcLoading ? (
              <div className="cp-list">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="cp-list-item">
                    <Skeleton h={20} />
                  </div>
                ))}
              </div>
            ) : !forecast?.monthlyBreakdown?.length ? (
              <EmptyState compact title="Нет данных" description="Добавьте счета и плановые операции — здесь появится разбивка по месяцам." />
            ) : (
              <>
                <div className="cp-monthly-head cp-monthly-row" aria-hidden="true">
                  <span>Месяц</span>
                  <span>Доходы</span>
                  <span>Расходы</span>
                  <span>Баланс</span>
                </div>
                <Accordion chevronPosition="left">
                  {forecast.monthlyBreakdown.map((mb) => (
                    <Accordion.Item key={mb.month} value={mb.month}>
                      <Accordion.Control>
                        <div className="cp-monthly-row mvv-num">
                          <span className="cp-nowrap">{formatMonth(mb.month).replace(/ г\.$/, '')}</span>
                          <span className="cp-amount" data-sign="pos">{formatMoney(mb.income, baseCurrency)}</span>
                          <span className="cp-amount" data-sign="neg">{formatMoney(mb.expense, baseCurrency)}</span>
                          <span className="cp-amount" data-sign={mb.endBalance < 0 ? 'neg' : undefined}>
                            <strong>{formatMoney(mb.endBalance, baseCurrency)}</strong>
                          </span>
                        </div>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {Object.keys(mb.byCategory).length === 0 ? (
                          <Text fz="sm" c="dimmed">Нет операций по категориям</Text>
                        ) : (
                          <Table fz="sm">
                            <Table.Tbody>
                              {Object.entries(mb.byCategory).map(([catId, amount]) => (
                                <Table.Tr key={catId}>
                                  <Table.Td c="dimmed">Категория {catId}</Table.Td>
                                  <Table.Td ta="right">{formatMoney(amount, baseCurrency)}</Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </>
            )}
          </Section>
        </div>

        <div className="cp-stack">
          <AlertsPanel alerts={forecast?.alerts ?? []} loading={fcLoading} />

          <Section title="Ближайшие операции" description="Неподтверждённые, на 30 дней вперёд" padding="none">
            {opLoading ? (
              <div className="cp-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="cp-list-item">
                    <Skeleton h={20} />
                  </div>
                ))}
              </div>
            ) : upcomingOps.length === 0 ? (
              <EmptyState compact icon={<IconCalendarEvent size={22} />} title="Нет плановых операций" description="Запланированные платежи и поступления появятся здесь." />
            ) : (
              <>
                <ul className="cp-list">
                  {upcomingOps.map((op) => (
                    <li key={op.id} className="cp-list-item">
                      <span className="cp-list-date mvv-num">{op.operationDate ? formatDateCompact(op.operationDate) : '—'}</span>
                      <span className="cp-truncate cp-grow" title={op.description ?? undefined}>
                        <Text span fz="sm" fw={500}>{op.description ?? `Операция #${op.id}`}</Text>
                        {op.recurrenceRuleId && (
                          <IconRepeat size={12} stroke={2} aria-label="Повторяющаяся" className="cp-inline-icon" />
                        )}
                        {op.tags?.[0] && (
                          <Badge size="xs" variant="dot" color={tagColor(op.tags[0])} ml={6}>
                            {op.tags[0]}
                          </Badge>
                        )}
                      </span>
                      <span className="cp-amount mvv-num" data-sign={op.amount >= 0 ? 'pos' : 'neg'}>
                        <Text span fz="sm" fw={600} c="inherit">{formatMoneyWithSign(op.amount, op.currency)}</Text>
                      </span>
                      <Tooltip label="Подтвердить">
                        <ActionIcon color="green" aria-label="Подтвердить" onClick={() => handleConfirm(op.id)}>
                          <IconCheck size={16} stroke={1.75} />
                        </ActionIcon>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
                <Link to="/operations" className="cp-list-link">Все операции →</Link>
              </>
            )}
          </Section>

          <Section title="Счета" actions={<Link to="/accounts" className="cp-link">Управление</Link>} padding="none">
            {accLoading ? (
              <div className="cp-list">
                {[1, 2].map((i) => (
                  <div key={i} className="cp-list-item"><Skeleton h={36} /></div>
                ))}
              </div>
            ) : accError && activeAccounts.length === 0 ? (
              <ErrorState compact error={accError} onRetry={() => void fetchAccounts()} />
            ) : activeAccounts.length === 0 ? (
              <EmptyState compact icon={<IconBuildingBank size={22} />} title="Нет счетов" description="Добавьте счёт, чтобы видеть капитал и прогноз." />
            ) : (
              <div>
                {activeAccounts.map((acc) => <AccountRow key={acc.id} acc={acc} />)}
              </div>
            )}
          </Section>
        </div>
      </div>
    </Page>
  );
}
