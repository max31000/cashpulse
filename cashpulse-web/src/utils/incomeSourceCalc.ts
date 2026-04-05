import type { IncomeTranche, DistributionRule, DistributionValueMode } from '../api/types';
import { formatMoney } from './formatMoney';

// Form-layer type used by DistributionTable (values can be '' when empty)
export interface DistributionRuleFormValues {
  accountId: number;
  valueMode: DistributionValueMode;
  percent: number | '';
  fixedAmount: number | '';
  delayDays: number | '';
  categoryId: string; // '' = without category
}

/**
 * Calculates tranche amount as a number
 */
export function calcTrancheAmountNumber(
  tranche: Pick<IncomeTranche, 'amountMode' | 'fixedAmount' | 'percentOfTotal'>,
  expectedTotal: number,
): number {
  if (tranche.amountMode === 'PercentOfTotal' && tranche.percentOfTotal) {
    return (expectedTotal * tranche.percentOfTotal) / 100;
  }
  return tranche.fixedAmount ?? 0;
}

/**
 * Returns formatted or numeric tranche amount
 */
export function calcTrancheAmount(
  tranche: Pick<IncomeTranche, 'amountMode' | 'fixedAmount' | 'percentOfTotal'>,
  expectedTotal: number,
  currency: string,
  output: 'formatted' | 'number' = 'formatted',
): string | number {
  const amount = calcTrancheAmountNumber(tranche, expectedTotal);
  if (output === 'number') return amount;
  return amount > 0 ? formatMoney(amount, currency) : '—';
}

/**
 * Calculates the amount for a specific distribution rule
 */
export function calcRuleAmountNumber(
  rule: Pick<DistributionRule, 'valueMode' | 'percent' | 'fixedAmount'>,
  trancheAmount: number,
  allRules: Pick<DistributionRule, 'valueMode' | 'percent' | 'fixedAmount'>[],
): number {
  if (rule.valueMode === 'Percent' && rule.percent) {
    return (trancheAmount * rule.percent) / 100;
  }
  if (rule.valueMode === 'FixedAmount' && rule.fixedAmount) {
    return rule.fixedAmount;
  }
  if (rule.valueMode === 'Remainder') {
    let used = 0;
    allRules.forEach((r) => {
      if (r.valueMode === 'FixedAmount' && r.fixedAmount) used += r.fixedAmount;
      if (r.valueMode === 'Percent' && r.percent) used += (trancheAmount * r.percent) / 100;
    });
    return Math.max(0, trancheAmount - used);
  }
  return 0;
}

/**
 * Calculates the next payment date for a given day-of-month
 */
export function calcNextDate(dayOfMonth: number, from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();

  const getActualDay = (d: number, y: number, m: number) => {
    if (d === -1) return new Date(y, m + 1, 0).getDate(); // last day of month
    return Math.min(d, new Date(y, m + 1, 0).getDate());
  };

  const thisMonthDay = getActualDay(dayOfMonth, year, month);
  const thisMonthDate = new Date(year, month, thisMonthDay);

  if (thisMonthDate > from) return thisMonthDate;

  // Next month
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonthDay = getActualDay(dayOfMonth, nextYear, nextMonth);
  return new Date(nextYear, nextMonth, nextMonthDay);
}

/**
 * Calculates distribution summary for the progress bar
 */
export function calcDistributionSummary(
  rules: Pick<DistributionRuleFormValues, 'valueMode' | 'percent' | 'fixedAmount'>[],
  trancheAmount: number,
): { totalDistributed: number; totalPercent: number; hasRemainder: boolean } {
  let fixedSum = 0;
  let hasRemainder = false;

  rules.forEach((r) => {
    if (r.valueMode === 'FixedAmount' && r.fixedAmount) {
      fixedSum += r.fixedAmount as number;
    } else if (r.valueMode === 'Percent' && r.percent) {
      fixedSum += (trancheAmount * (r.percent as number)) / 100;
    } else if (r.valueMode === 'Remainder') {
      hasRemainder = true;
    }
  });

  const totalDistributed = hasRemainder ? trancheAmount : fixedSum;
  const totalPercent =
    trancheAmount > 0 ? Math.round((fixedSum / trancheAmount) * 100) : 0;

  return { totalDistributed, totalPercent, hasRemainder };
}
