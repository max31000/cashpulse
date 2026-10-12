import { ActionIcon, Badge, Tooltip } from '@mantine/core';
import { IconCheck, IconPencil, IconRepeat, IconTrash } from '@tabler/icons-react';
import type { Account, Category, PlannedOperation } from '../../api/types';
import { formatMoneyWithSign } from '../../utils/formatMoney';
import { formatDateWithWeekday, toISODateString } from '../../utils/formatDate';
import { tagColor } from '../../utils/colors';

interface Props {
  operations: PlannedOperation[];
  accounts?: Account[];
  categories?: Category[];
  /** Shows the account of each operation (lists that mix accounts). */
  showAccount?: boolean;
  onEdit: (op: PlannedOperation) => void;
  onDelete: (op: PlannedOperation) => void;
  onConfirm: (op: PlannedOperation) => void;
}

function operationDate(op: PlannedOperation): string {
  return op.operationDate ?? op.createdAt.split('T')[0];
}

/** Groups by date, newest first. */
function groupByDate(operations: PlannedOperation[]): Array<[string, PlannedOperation[]]> {
  const grouped = new Map<string, PlannedOperation[]>();
  for (const op of operations) {
    const date = operationDate(op);
    grouped.set(date, [...(grouped.get(date) ?? []), op]);
  }
  return [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));
}

const ICON = { size: 16, stroke: 1.75 } as const;

/**
 * Operations grouped by day with a status rail (confirmed / planned / overdue plan), amounts in tabular
 * figures and row actions. Meant to sit in a `Section padding="none"`.
 */
export function OperationList({ operations, accounts = [], categories = [], showAccount, onEdit, onDelete, onConfirm }: Props) {
  const today = toISODateString(new Date());

  return (
    <div>
      {groupByDate(operations).map(([date, ops]) => (
        <div key={date} className="cp-op-group">
          <div className="cp-op-date">{formatDateWithWeekday(date)}</div>
          <ul className="cp-op-rows">
            {ops.map((op) => {
              const opDate = op.operationDate;
              const isFuture = opDate ? opDate > today : false;
              const isOverdue = !op.isConfirmed && !!opDate && opDate < today;
              const account = showAccount ? accounts.find((a) => a.id === op.accountId) : undefined;
              const category = categories.find((c) => c.id === op.categoryId);
              const title = op.description ?? `Операция #${op.id}`;

              return (
                <li
                  key={op.id}
                  className="cp-op-row"
                  data-status={op.isConfirmed ? 'confirmed' : 'planned'}
                  data-future={isFuture || undefined}
                  data-overdue={isOverdue || undefined}
                >
                  <div className="cp-op-main">
                    <span className="cp-op-title cp-truncate" title={title}>{title}</span>
                    <span className="cp-op-meta">
                      {!op.isConfirmed && <span className="cp-meta-item" data-overdue={isOverdue || undefined}>{isOverdue ? 'Просрочено' : 'План'}</span>}
                      {category && (
                        <span className="cp-meta-item">
                          {category.color && <span className="cp-dot" style={{ background: category.color }} />}
                          {category.name}
                        </span>
                      )}
                      {account && <span className="cp-meta-item">{account.name}</span>}
                      {op.recurrenceRuleId && (
                        <span title="Повторяющаяся операция" aria-label="Повторяющаяся операция">
                          <IconRepeat size={12} stroke={2} />
                        </span>
                      )}
                      {op.tags?.map((tag) => (
                        <Badge key={tag} size="xs" variant="dot" color={tagColor(tag)}>
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </div>
                  <div className="cp-op-side">
                    <span className="cp-op-amount mvv-num" data-sign={op.amount >= 0 ? 'pos' : 'neg'}>
                      {formatMoneyWithSign(op.amount, op.currency)}
                    </span>
                    {op.isConfirmed ? (
                      <span className="cp-op-action-slot" aria-hidden="true" />
                    ) : (
                      <Tooltip label="Подтвердить">
                        <ActionIcon color="green" aria-label="Подтвердить" onClick={() => onConfirm(op)}>
                          <IconCheck {...ICON} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Изменить">
                      <ActionIcon aria-label="Изменить" onClick={() => onEdit(op)}>
                        <IconPencil {...ICON} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Удалить">
                      <ActionIcon aria-label="Удалить" onClick={() => onDelete(op)}>
                        <IconTrash {...ICON} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
