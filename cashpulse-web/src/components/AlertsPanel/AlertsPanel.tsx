import { useState } from 'react';
import { Paper, Stack, Text, Alert, Badge, Group, Button, Skeleton } from '@mantine/core';
import type { ForecastAlert } from '../../api/types';
import { formatDateCompact } from '../../utils/formatDate';

interface Props {
  alerts: ForecastAlert[];
  loading: boolean;
}

function AlertItem({ alert }: { alert: ForecastAlert }) {
  const [open, setOpen] = useState(false);

  const color = alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'yellow' : 'blue';
  const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
  const title = alert.severity === 'critical' ? 'Критично' : alert.severity === 'warning' ? 'Предупреждение' : 'Информация';

  const shortMessage =
    alert.message.length > 80 ? alert.message.slice(0, 80) + '…' : alert.message;

  return (
    <Alert
      color={color}
      variant="light"
      title={
        <Group justify="space-between" wrap="nowrap">
          <Text fz="sm" fw={600}>{icon} {title}</Text>
          <Text fz="xs" c="dimmed">{formatDateCompact(alert.date)}</Text>
        </Group>
      }
    >
      <Text fz="xs">{open ? alert.message : shortMessage}</Text>
      {open && (
        <Text fz="xs" mt="xs" c="dimmed">
          Рекомендация: {alert.suggestedAction}
        </Text>
      )}
      {(alert.message.length > 80 || alert.suggestedAction) && (
        <Button
          variant="subtle"
          size="xs"
          fz="xs"
          mt={4}
          p={0}
          h="auto"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Свернуть ▲' : 'Развернуть ▼'}
        </Button>
      )}
    </Alert>
  );
}

export function AlertsPanel({ alerts, loading }: Props) {
  const [showAll, setShowAll] = useState(false);
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const visibleAlerts = showAll ? alerts : alerts.slice(0, 5);
  const hiddenCount = alerts.length - 5;

  if (loading) {
    return (
      <Paper p="md" withBorder radius="md">
        <Skeleton h={20} mb="sm" width="60%" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} h={64} mb="sm" />
        ))}
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Text fz="sm" fw={600} c="dimmed" tt="uppercase">Предупреждения</Text>
        {criticalCount > 0 && (
          <Badge color="red" variant="filled" size="sm">{criticalCount}</Badge>
        )}
      </Group>

      {alerts.length === 0 ? (
        <Alert color="green" variant="light" title="Всё в порядке">
          <Text fz="xs">Критических предупреждений нет</Text>
        </Alert>
      ) : (
        <Stack gap="xs">
          {visibleAlerts.map((alert, idx) => (
            <AlertItem key={idx} alert={alert} />
          ))}
          {!showAll && hiddenCount > 0 && (
            <Button variant="subtle" size="xs" fz="xs" onClick={() => setShowAll(true)}>
              Показать ещё {hiddenCount}
            </Button>
          )}
        </Stack>
      )}
    </Paper>
  );
}
