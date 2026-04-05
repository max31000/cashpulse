export interface User {
  id: number;
  email: string;
  displayName: string;
  baseCurrency: string;
}

export interface CurrencyBalance {
  accountId: number;
  currency: string;
  amount: number;
}

export interface Account {
  id: number;
  userId: number;
  name: string;
  type: 'debit' | 'credit' | 'investment' | 'cash' | 'deposit';
  creditLimit?: number;
  gracePeriodDays?: number;
  minPaymentPercent?: number;
  statementDay?: number;
  dueDay?: number;
  // Deposits (type='deposit') and savings investment accounts (investmentSubtype='savings')
  interestRate?: number;
  interestAccrualDay?: number;
  depositEndDate?: string;
  canTopUpAlways?: boolean;
  canWithdraw?: boolean;
  dailyAccrual?: boolean;
  // Investment accounts (type='investment')
  investmentSubtype?: 'savings' | 'bonds' | 'stocks';
  // Credit cards (type='credit')
  gracePeriodEndDate?: string;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  balances: CurrencyBalance[];
}

export interface Category {
  id: number;
  userId: number;
  name: string;
  parentId?: number;
  icon?: string;
  color?: string;
  isSystem: boolean;
  sortOrder: number;
}

export interface RecurrenceRule {
  id?: number;
  type: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  dayOfMonth?: number;
  interval?: number;
  daysOfWeek?: number[];
  startDate: string;
  endDate?: string;
}

export interface PlannedOperation {
  id: number;
  userId: number;
  accountId: number;
  amount: number;
  currency: string;
  categoryId?: number;
  tags?: string[];
  description?: string;
  operationDate?: string;
  recurrenceRuleId?: number;
  recurrenceRule?: RecurrenceRule;
  isConfirmed: boolean;
  scenarioId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Scenario {
  id: number;
  userId: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  updatedAt: string;
}

export interface ForecastAlert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  date: string;
  accountId?: number;
  message: string;
  suggestedAction: string;
}

export interface TimelinePoint {
  date: string;
  balance: number;
  isScenario: boolean;
}

export interface NetWorthPoint {
  date: string;
  amount: number;
  currency: string;
}

export interface MonthlyBreakdown {
  month: string;
  income: number;
  expense: number;
  endBalance: number;
  byCategory: Record<number, number>;
}

export interface ForecastResponse {
  timelines: Record<string, TimelinePoint[]>;
  netWorth: NetWorthPoint[];
  alerts: ForecastAlert[];
  monthlyBreakdown: MonthlyBreakdown[];
}

export interface TagSummary {
  tag: string;
  operationCount: number;
  totalConfirmed: number;
  totalPlanned: number;
  total: number;
  currency: string;
}

export interface OperationFilter {
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  tag?: string;
  isConfirmed?: boolean;
  scenarioId?: number;
  offset?: number;
  limit?: number;
}

export interface CreateOperationDto {
  accountId: number;
  amount: number;
  currency: string;
  categoryId?: number;
  tags?: string[];
  description?: string;
  operationDate?: string;
  recurrenceRule?: Omit<RecurrenceRule, 'id'>;
  scenarioId?: number;
  isConfirmed?: boolean;
}

export interface CreateAccountDto {
  name: string;
  type: 'debit' | 'credit' | 'investment' | 'cash' | 'deposit';
  balances: { currency: string; amount: number }[];
  creditLimit?: number;
  gracePeriodDays?: number;
  minPaymentPercent?: number;
  statementDay?: number;
  dueDay?: number;
  interestRate?: number;
  interestAccrualDay?: number;
  depositEndDate?: string;
  canTopUpAlways?: boolean;
  canWithdraw?: boolean;
  dailyAccrual?: boolean;
  investmentSubtype?: string;
  gracePeriodEndDate?: string;
}

export interface CreateScenarioDto {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateCategoryDto {
  name: string;
  parentId?: number;
  icon?: string;
  color?: string;
}

export interface ImportPreviewResponse {
  fileName: string;
  headers: string[];
  /** Preview rows (up to 9 data rows) */
  preview: string[][];
  totalPreviewLines: number;
}

export interface ImportResultResponse {
  imported: number;
  errors: string[];
  message: string;
}

// ─── Income Sources ───────────────────────────────────────────────
export type AmountMode = 'Fixed' | 'PercentOfTotal' | 'Estimated';
export type DistributionValueMode = 'Percent' | 'FixedAmount' | 'Remainder';

export interface DistributionRule {
  id?: number;
  trancheId?: number;
  accountId: number;
  currency?: string;
  valueMode: DistributionValueMode;
  percent?: number;
  fixedAmount?: number;
  delayDays: number;
  categoryId?: number;
  tags?: string[];
  sortOrder?: number;
}

export interface IncomeTranche {
  id?: number;
  incomeSourceId?: number;
  name: string;
  dayOfMonth: number;
  amountMode: AmountMode;
  fixedAmount?: number;
  percentOfTotal?: number;
  estimatedMin?: number;
  estimatedMax?: number;
  sortOrder?: number;
  distributionRules: DistributionRule[];
}

export interface IncomeSource {
  id: number;
  userId: number;
  name: string;
  currency: string;
  expectedTotal?: number;
  isActive: boolean;
  description?: string;
  tranches: IncomeTranche[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncomeSourceDto {
  name: string;
  currency: string;
  expectedTotal?: number;
  isActive?: boolean;
  description?: string;
  tranches: Omit<IncomeTranche, 'id' | 'incomeSourceId'>[];
}

export interface GenerateOperationsRequest {
  from: string;
  to: string;
  preview: boolean;
  actualAmount?: number;
  trancheId?: number;
}

export interface GeneratedOpDto {
  date: string;
  accountId: number;
  amount: number;
  currency: string;
  categoryId?: number;
  tags: string[];
  description?: string;
  trancheId: number;
  trancheName: string;
  isDuplicate: boolean;
}

export interface GeneratePreviewResponse {
  operations: GeneratedOpDto[];
}

export interface ConfirmTrancheRequest {
  trancheId: number;
  month: string;
  actualAmount: number;
}
