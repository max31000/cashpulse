import { useEffect, useState } from 'react';
import {
  Stack, Text, Table, Badge, Modal, Skeleton, Group, Divider
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTagStore } from '../store/useTagStore';
import type { TagSummary } from '../api/types';
import { tagColor } from '../utils/colors';
import { formatMoney } from '../utils/formatMoney';

type SortKey = 'tag' | 'operationCount' | 'totalConfirmed' | 'totalPlanned' | 'total';
type SortDir = 'asc' | 'desc' | null;

export default function Tags() {
  const { tags, loading, fetch } = useTagStore();
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTag, setSelectedTag] = useState<TagSummary | null>(null);
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false);

  useEffect(() => { void fetch(); }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key || sortDir === null) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const sorted = [...tags].sort((a, b) => {
    if (!sortDir) return 0;
    let va: string | number = 0, vb: string | number = 0;
    if (sortKey === 'tag') { va = a.tag; vb = b.tag; }
    else if (sortKey === 'operationCount') { va = a.operationCount; vb = b.operationCount; }
    else if (sortKey === 'totalConfirmed') { va = a.totalConfirmed; vb = b.totalConfirmed; }
    else if (sortKey === 'totalPlanned') { va = a.totalPlanned; vb = b.totalPlanned; }
    else if (sortKey === 'total') { va = a.total; vb = b.total; }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  if (loading) {
    return (
      <Stack>
        <Text fz="xl" fw={700}>Теги</Text>
        {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} h={40} />)}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text fz="xl" fw={700}>Теги</Text>

      {tags.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Тегов нет. Добавьте теги к операциям.</Text>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('tag')}>
                Тег{sortIndicator('tag')}
              </Table.Th>
              <Table.Th ta="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('operationCount')}>
                Операций{sortIndicator('operationCount')}
              </Table.Th>
              <Table.Th ta="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('totalConfirmed')}>
                Подтверждено{sortIndicator('totalConfirmed')}
              </Table.Th>
              <Table.Th ta="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('totalPlanned')}>
                Запланировано{sortIndicator('totalPlanned')}
              </Table.Th>
              <Table.Th ta="right" style={{ cursor: 'pointer' }} onClick={() => handleSort('total')}>
                Итого{sortIndicator('total')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((t) => (
              <Table.Tr
                key={t.tag}
                style={{ cursor: 'pointer' }}
                onClick={() => { setSelectedTag(t); openDetail(); }}
              >
                <Table.Td>
                  <Badge variant="dot" size="sm" color={tagColor(t.tag)} tt="lowercase">{t.tag}</Badge>
                </Table.Td>
                <Table.Td ta="right">{t.operationCount}</Table.Td>
                <Table.Td ta="right" c={t.totalConfirmed > 0 ? 'green' : undefined}>
                  {formatMoney(t.totalConfirmed, t.currency)}
                </Table.Td>
                <Table.Td ta="right" c="dimmed">{formatMoney(t.totalPlanned, t.currency)}</Table.Td>
                <Table.Td ta="right" fw={600}>{formatMoney(t.total, t.currency)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {selectedTag && (
        <Modal
          opened={detailOpened}
          onClose={closeDetail}
          title={`#${selectedTag.tag}`}
          size="lg"
        >
          <Stack gap="sm">
            <Text fz="sm" c="dimmed">
              {selectedTag.operationCount} операций · Итого: {formatMoney(selectedTag.total, selectedTag.currency)}
            </Text>
            <Divider />
            <Group>
              <Text fz="sm">Подтверждено: <Text span c="green" fw={600}>{formatMoney(selectedTag.totalConfirmed, selectedTag.currency)}</Text></Text>
              <Text fz="sm">Запланировано: <Text span c="dimmed">{formatMoney(selectedTag.totalPlanned, selectedTag.currency)}</Text></Text>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}
