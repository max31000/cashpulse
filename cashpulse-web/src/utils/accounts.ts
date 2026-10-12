import type { Account } from '../api/types';

/** Share of the credit limit in use, 0–100+, or null for non-credit accounts / no limit. */
export function creditUsage(acc: Account): number | null {
  if (acc.type !== 'credit' || !acc.creditLimit) return null;
  return (Math.abs(acc.balances[0]?.amount ?? 0) / acc.creditLimit) * 100;
}

/** Days until the next `dueDay` of the month (credit cards), or null. */
export function daysUntilDue(acc: Account, now: Date = new Date()): number | null {
  if (!acc.dueDay) return null;
  const next = new Date(now.getFullYear(), now.getMonth(), acc.dueDay);
  if (next < now) next.setMonth(next.getMonth() + 1);
  return Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
}

/** Days left in the interest-free period of a credit card (negative = expired), or null. */
export function graceDaysLeft(acc: Account, now: number = Date.now()): number | null {
  if (acc.type !== 'credit' || !acc.gracePeriodEndDate) return null;
  return Math.round((new Date(acc.gracePeriodEndDate).getTime() - now) / 86_400_000);
}
