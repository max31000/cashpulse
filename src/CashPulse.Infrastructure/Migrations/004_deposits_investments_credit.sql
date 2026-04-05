-- Migration 004: Deposits, Investment subtypes, Credit card improvements
-- Applied automatically by MigrationRunner on application start

-- =====================================================================
-- 1. Расширить ENUM AccountType: добавить 'deposit' в конец списка
--    MySQL 8.0: MODIFY COLUMN для расширения ENUM — instant DDL,
--    полного перестроения таблицы не происходит.
-- =====================================================================
ALTER TABLE Accounts
    MODIFY COLUMN Type ENUM('debit','credit','investment','cash','deposit') NOT NULL;

-- =====================================================================
-- 2. Новые колонки для вкладов, инвестсчётов и кредитных карт
--    Все колонки NULL DEFAULT NULL — MySQL 8.0 выполняет как instant DDL.
-- =====================================================================
ALTER TABLE Accounts
    ADD COLUMN InterestRate       DECIMAL(6,2)                     NULL DEFAULT NULL
        COMMENT 'Годовая ставка в % (16.00 = 16%). При расчёте делить на 100.',
    ADD COLUMN InterestAccrualDay INT                              NULL DEFAULT NULL
        COMMENT 'День месяца начисления процентов (1-28). Fallback: последний день месяца.',
    ADD COLUMN DepositEndDate     DATE                             NULL DEFAULT NULL
        COMMENT 'Дата окончания вклада. NULL = бессрочный.',
    ADD COLUMN CanTopUpAlways     TINYINT(1)                       NULL DEFAULT NULL
        COMMENT '1=пополнение всегда, 0=только первые 30 дней',
    ADD COLUMN CanWithdraw        TINYINT(1)                       NULL DEFAULT NULL
        COMMENT '1=снятие разрешено, 0=запрещено до окончания',
    ADD COLUMN InvestmentSubtype  ENUM('savings','bonds','stocks') NULL DEFAULT NULL
        COMMENT 'Подтип инвестсчёта. Применимо только при Type=investment.',
    ADD COLUMN GracePeriodEndDate DATE                             NULL DEFAULT NULL
        COMMENT 'Дата окончания беспроцентного периода кредитки. Применимо при Type=credit.';

-- =====================================================================
-- 3. CHECK-констрейнт на InterestAccrualDay
--    Поддерживается с MySQL 8.0.16.
-- =====================================================================
ALTER TABLE Accounts
    ADD CONSTRAINT chk_interest_accrual_day
        CHECK (InterestAccrualDay IS NULL OR (InterestAccrualDay >= 1 AND InterestAccrualDay <= 28));

-- =====================================================================
-- 4. Индексы для ForecastEngine
--    idx_accounts_user_archived (UserId, IsArchived) уже существует в 001 — не дублируется.
-- =====================================================================
ALTER TABLE Accounts
    ADD KEY idx_accounts_deposit_end_date (DepositEndDate),
    ADD KEY idx_accounts_grace_period_end (GracePeriodEndDate);
