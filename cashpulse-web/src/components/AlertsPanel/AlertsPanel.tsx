import { useState } from 'react';
import { Alert, Badge, Button, Skeleton, Stack, Text } from '@mantine/core';
import { Section } from '@mvv42/kit';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconUrgent } from '@tabler/icons-react';
import type { ForecastAlert } from '../../api/types';
import { formatDateCompact } from '../../utils/formatDate';

interface Props {
  alerts: ForecastAlert[];
  loading: boolean;
}

const SEVERITY = {
  critical: { color: 'red', title: 'Критично', Icon: IconUrgent },
  warning: { color: 'yellow', title: 'Предупреждение', Icon: IconAlertTriangle },
  info: { color: 'blue', title: 'Информация', Icon: IconInfoCircle },
} as const;

function AlertItem({ alert }: { alert: ForecastAlert }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY[alert.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
  const long = alert.message.length > 80;
  const shortMessage = long ? alert.message.slice(0, 80) + '…' : alert.message;

  return (
    <Alert
      color={meta.color}
      icon={<meta.Icon size={18} stroke={1.75} />}
      title={
        <>
          {meta.title}
          <Text span fz="xs" c="dimmed" fw={400} ml={8} className="mvv-num">
            {formatDateCompact(alert.date)}
          </Text>
        </>
      }
    >
      <Text fz="sm">{open ? alert.message : shortMessage}</Text>
      {open && alert.suggestedAction && (
        <Text fz="sm" mt="xs" c="dimmed">
          Рекомендация: {alert.suggestedAction}
        </Text>
      )}
      {(long || alert.suggestedAction) && (
        <Button variant="subtle" size="compact-xs" mt={4} px={0} onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Развернуть'}
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

  return (
    <Section
      title="Предупреждения"
      actions={criticalCount > 0 ? <Badge color="red" variant="filled" size="sm">{criticalCount}</Badge> : undefined}
    >
      {loading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} h={64} />
          ))}
        </Stack>
      ) : alerts.length === 0 ? (
        <Alert color="green" icon={<IconCircleCheck size={18} stroke={1.75} />} title="Всё в порядке">
          <Text fz="sm">Критических предупреждений нет</Text>
        </Alert>
      ) : (
        <Stack gap="xs">
          {visibleAlerts.map((alert, idx) => (
            <AlertItem key={idx} alert={alert} />
          ))}
          {!showAll && hiddenCount > 0 && (
            <Button variant="subtle" size="xs" onClick={() => setShowAll(true)}>
              Показать ещё {hiddenCount}
            </Button>
          )}
        </Stack>
      )}
    </Section>
  );
}
