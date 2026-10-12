import { SegmentedControl, Text } from '@mantine/core';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame, ChartTooltip, chartColors, useChartTheme } from '@mvv42/kit/charts';
import type { ForecastResponse } from '../../api/types';
import { formatXAxisDate, formatDateFull } from '../../utils/formatDate';
import { formatMoneyCompact, formatMoney } from '../../utils/formatMoney';

/** Below this the balance is «thin» (warning colour and reference line). */
export const LOW_BALANCE_THRESHOLD = 50_000;

interface Props {
  forecast: ForecastResponse | null;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  horizon: number;
  onHorizonChange: (h: number) => void;
  baseCurrency: string;
}

/** Health of the base plan → semantic colour (meaning, not decoration). */
function healthColor(minBalance: number): string {
  if (minBalance < 0) return chartColors.negative;
  if (minBalance < LOW_BALANCE_THRESHOLD) return chartColors.warning;
  return chartColors.positive;
}

export function ForecastChart({ forecast, loading, error, onRetry, horizon, onHorizonChange, baseCurrency }: Props) {
  const t = useChartTheme();

  const timelineData =
    forecast?.timelines?.[baseCurrency] ??
    forecast?.netWorth?.map((p) => ({ date: p.date, balance: p.amount, isScenario: false })) ??
    [];
  const baseData = timelineData.filter((p) => !p.isScenario);
  const scenarioData = timelineData.filter((p) => p.isScenario);
  const hasScenario = scenarioData.length > 0;
  const minBalance = baseData.length > 0 ? Math.min(...baseData.map((p) => p.balance)) : 0;
  const baseColor = healthColor(minBalance);

  const data = baseData.map((point) => ({
    ...point,
    scenarioBalance: scenarioData.find((s) => s.date === point.date)?.balance,
  }));

  return (
    <ChartFrame
      title="Прогноз баланса"
      description={`${baseCurrency}, базовый план${hasScenario ? ' и активные сценарии' : ''}`}
      explanation={
        <>
          Баланс по дням с учётом плановых и повторяющихся операций. Цвет линии — запас прочности: зелёный —
          всё в порядке, жёлтый — минимум ниже {formatMoney(LOW_BALANCE_THRESHOLD, baseCurrency)}, красный — уход в
          минус. Пунктир — с учётом активных сценариев.
        </>
      }
      loading={loading}
      error={error || undefined}
      onRetry={onRetry}
      empty={data.length === 0}
      emptyTitle="Нет данных для прогноза"
      emptyDescription="Добавьте счета с балансом и плановые операции."
      actions={
        <SegmentedControl
          size="xs"
          value={String(horizon)}
          onChange={(v) => onHorizonChange(Number(v))}
          data={[
            { label: '3 мес', value: '3' },
            { label: '6 мес', value: '6' },
            { label: '12 мес', value: '12' },
          ]}
        />
      }
    >
      <AreaChart data={data} margin={t.margin}>
        <CartesianGrid {...t.grid} />
        <XAxis dataKey="date" tickFormatter={formatXAxisDate} {...t.xAxis} />
        <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, baseCurrency)} {...t.yAxis} width={64} />
        <Tooltip
          {...t.tooltip}
          content={
            <ChartTooltip
              labelFormatter={(l) => formatDateFull(String(l))}
              valueFormatter={(v) => formatMoney(Number(v), baseCurrency)}
            />
          }
        />
        {hasScenario && <Legend {...t.legend} />}
        <ReferenceLine y={0} stroke={chartColors.negative} strokeDasharray="4 4" strokeOpacity={0.7} />
        <ReferenceLine y={LOW_BALANCE_THRESHOLD} stroke={chartColors.warning} strokeDasharray="4 4" strokeOpacity={0.7} />
        <Area {...t.area} dataKey="balance" name="Базовый план" stroke={baseColor} fill={baseColor} />
        {hasScenario && (
          <Area
            {...t.area}
            dataKey="scenarioBalance"
            name="Со сценариями"
            stroke={chartColors.series[1]}
            strokeDasharray="6 4"
            fill="none"
          />
        )}
      </AreaChart>
    </ChartFrame>
  );
}

// Comparison chart for the scenario page
interface ComparisonChartProps {
  baseData: Array<{ date: string; balance: number }>;
  scenarioData: Array<{ date: string; balance: number }>;
  baseCurrency: string;
}

export function ScenarioComparisonChart({ baseData, scenarioData, baseCurrency }: ComparisonChartProps) {
  const t = useChartTheme({ height: 250 });
  const data = baseData.map((point) => ({
    date: point.date,
    base: point.balance,
    scenario: scenarioData.find((s) => s.date === point.date)?.balance,
  }));

  if (data.length === 0) return <Text c="dimmed" fz="sm">Нет данных</Text>;

  return (
    <ChartFrame title="Сравнение с базовым планом" height={250}>
      <LineChart data={data} margin={t.margin}>
        <CartesianGrid {...t.grid} />
        <XAxis dataKey="date" tickFormatter={formatXAxisDate} {...t.xAxis} />
        <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, baseCurrency)} {...t.yAxis} width={64} />
        <Tooltip
          {...t.tooltip}
          content={<ChartTooltip labelFormatter={(l) => formatDateFull(String(l))} valueFormatter={(v) => formatMoney(Number(v), baseCurrency)} />}
        />
        <Legend {...t.legend} />
        <Line {...t.line} dataKey="base" name="Базовый план" stroke={chartColors.series[0]} />
        <Line {...t.line} dataKey="scenario" name="Со сценарием" stroke={chartColors.series[1]} strokeDasharray="6 4" />
      </LineChart>
    </ChartFrame>
  );
}
