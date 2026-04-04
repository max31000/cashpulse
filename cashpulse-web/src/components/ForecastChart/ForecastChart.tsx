import { Paper, Group, Text, SegmentedControl, Skeleton } from '@mantine/core';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  LineChart,
} from 'recharts';
import type { ForecastResponse } from '../../api/types';
import { formatXAxisDate, formatDateFull } from '../../utils/formatDate';
import { formatMoneyCompact, formatMoney } from '../../utils/formatMoney';

interface Props {
  forecast: ForecastResponse | null;
  loading: boolean;
  horizon: number;
  onHorizonChange: (h: number) => void;
  baseCurrency: string;
}

interface TooltipPayloadEntry {
  value: number;
  name: string;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <Paper p="sm" shadow="md" withBorder>
      <Text fz="xs" fw={600} mb={4}>{label ? formatDateFull(label) : ''}</Text>
      {payload.map((p) => (
        <Text key={p.name} fz="xs" c={p.color}>
          {p.name}: {formatMoney(p.value, 'RUB')}
        </Text>
      ))}
    </Paper>
  );
}

export function ForecastChart({ forecast, loading, horizon, onHorizonChange, baseCurrency }: Props) {
  if (loading) {
    return (
      <Paper p="lg" shadow="sm" withBorder>
        <Skeleton h={24} mb="sm" width="40%" />
        <Skeleton h={300} />
      </Paper>
    );
  }

  const timelineData = forecast?.timelines?.[baseCurrency] ?? forecast?.netWorth?.map(p => ({ date: p.date, balance: p.amount, isScenario: false })) ?? [];

  const baseData = timelineData.filter((p) => !p.isScenario);
  const scenarioData = timelineData.filter((p) => p.isScenario);
  const hasScenario = scenarioData.length > 0;

  const minBalance = baseData.length > 0 ? Math.min(...baseData.map((p) => p.balance)) : 0;
  const strokeColor =
    minBalance < 0 ? '#EF4444' : minBalance < 50000 ? '#EAB308' : '#22C55E';
  const gradientId =
    minBalance < 0 ? 'gradRed' : minBalance < 50000 ? 'gradYellow' : 'gradGreen';

  const mergedData = baseData.map((point) => {
    const scen = scenarioData.find((s) => s.date === point.date);
    return {
      ...point,
      scenarioBalance: scen?.balance,
    };
  });

  return (
    <Paper p="lg" shadow="sm" withBorder>
      <Group justify="space-between" mb="md">
        <Text fz="sm" fw={600} c="dimmed" tt="uppercase">Прогноз баланса</Text>
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
      </Group>

      {mergedData.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Нет данных для прогноза</Text>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={mergedData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(34, 197, 94, 0.6)" />
                  <stop offset="95%" stopColor="rgba(34, 197, 94, 0.05)" />
                </linearGradient>
                <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(234, 179, 8, 0.6)" />
                  <stop offset="95%" stopColor="rgba(234, 179, 8, 0.05)" />
                </linearGradient>
                <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(239, 68, 68, 0.6)" />
                  <stop offset="95%" stopColor="rgba(239, 68, 68, 0.05)" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxisDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => formatMoneyCompact(v, baseCurrency)}
                width={70}
                tick={{ fontSize: 11 }}
              />
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="rgba(239, 68, 68, 0.8)" strokeDasharray="4 4" />
              <ReferenceLine y={50000} stroke="rgba(234, 179, 8, 0.8)" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                name="Net Worth"
                stroke={strokeColor}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              {hasScenario && (
                <Area
                  type="monotone"
                  dataKey="scenarioBalance"
                  name="Сценарий"
                  stroke="#3B82F6"
                  strokeDasharray="8 4"
                  fill="none"
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
          {hasScenario && (
            <Text fz="xs" c="dimmed" ta="center" mt="xs">
              ── базовый план &nbsp;&nbsp; – – активный сценарий
            </Text>
          )}
        </>
      )}
    </Paper>
  );
}

// Separate comparison chart for Scenario detail page
interface ComparisonChartProps {
  baseData: Array<{ date: string; balance: number }>;
  scenarioData: Array<{ date: string; balance: number }>;
  baseCurrency: string;
}

export function ScenarioComparisonChart({ baseData, scenarioData, baseCurrency }: ComparisonChartProps) {
  const mergedData = baseData.map((point) => {
    const scen = scenarioData.find((s) => s.date === point.date);
    return {
      date: point.date,
      base: point.balance,
      scenario: scen?.balance,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={mergedData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <XAxis dataKey="date" tickFormatter={formatXAxisDate} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => formatMoneyCompact(v, baseCurrency)} width={70} tick={{ fontSize: 11 }} />
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="base" name="Базовый план" stroke="#3B82F6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="scenario" name="Со сценарием" stroke="#3B82F6" strokeDasharray="8 4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
