-- Migration 001: Initial schema
-- CashPulse database schema

-- 1. _migrations table
CREATE TABLE IF NOT EXISTS _migrations (
    Id          INT           NOT NULL AUTO_INCREMENT,
    FileName    VARCHAR(255)  NOT NULL,
    AppliedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    UNIQUE KEY uq_migrations_filename (FileName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users
CREATE TABLE IF NOT EXISTS Users (
    Id              BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
    GoogleSubjectId VARCHAR(255)       NULL         DEFAULT NULL,
    Email           VARCHAR(255)       NOT NULL,
    DisplayName     VARCHAR(255)       NOT NULL,
    BaseCurrency    VARCHAR(3)         NOT NULL     DEFAULT 'RUB',
    CreatedAt       DATETIME           NOT NULL     DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME           NOT NULL     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    UNIQUE KEY uq_users_google_subject_id (GoogleSubjectId),
    UNIQUE KEY uq_users_email (Email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. RecurrenceRules
CREATE TABLE IF NOT EXISTS RecurrenceRules (
    Id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    Type         ENUM('daily','weekly','biweekly','monthly','quarterly','yearly','custom') NOT NULL,
    DayOfMonth   INT               NULL DEFAULT NULL COMMENT '1-31 or -1 for last day of month',
    Interval_    INT               NULL DEFAULT NULL COMMENT 'For custom: every N days',
    DaysOfWeek   JSON              NULL DEFAULT NULL COMMENT 'For weekly: array [0..6], 0=Sunday',
    StartDate    DATE              NOT NULL,
    EndDate      DATE              NULL DEFAULT NULL COMMENT 'NULL = no end date',

    PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Accounts
CREATE TABLE IF NOT EXISTS Accounts (
    Id                 BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId             BIGINT UNSIGNED   NOT NULL,
    Name               VARCHAR(255)      NOT NULL,
    Type               ENUM('debit','credit','investment','cash') NOT NULL,
    CreditLimit        DECIMAL(18,2)     NULL DEFAULT NULL,
    GracePeriodDays    INT               NULL DEFAULT NULL,
    MinPaymentPercent  DECIMAL(5,2)      NULL DEFAULT NULL,
    StatementDay       INT               NULL DEFAULT NULL,
    DueDay             INT               NULL DEFAULT NULL,
    IsArchived         TINYINT(1)        NOT NULL DEFAULT 0,
    SortOrder          INT               NOT NULL DEFAULT 0,
    CreatedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_accounts_user_archived (UserId, IsArchived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. CurrencyBalances
CREATE TABLE IF NOT EXISTS CurrencyBalances (
    AccountId  BIGINT UNSIGNED   NOT NULL,
    Currency   VARCHAR(3)        NOT NULL,
    Amount     DECIMAL(18,2)     NOT NULL DEFAULT 0,

    PRIMARY KEY (AccountId, Currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Categories
CREATE TABLE IF NOT EXISTS Categories (
    Id         BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId     BIGINT UNSIGNED   NOT NULL,
    Name       VARCHAR(255)      NOT NULL,
    ParentId   BIGINT UNSIGNED   NULL DEFAULT NULL,
    Icon       VARCHAR(50)       NULL DEFAULT NULL,
    Color      VARCHAR(7)        NULL DEFAULT NULL,
    IsSystem   TINYINT(1)        NOT NULL DEFAULT 0,
    SortOrder  INT               NOT NULL DEFAULT 0,

    PRIMARY KEY (Id),
    KEY idx_categories_user (UserId),
    KEY idx_categories_parent (ParentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Scenarios
CREATE TABLE IF NOT EXISTS Scenarios (
    Id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId      BIGINT UNSIGNED   NOT NULL,
    Name        VARCHAR(255)      NOT NULL,
    Description TEXT              NULL DEFAULT NULL,
    IsActive    TINYINT(1)        NOT NULL DEFAULT 0,
    CreatedAt   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_scenarios_user_active (UserId, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. PlannedOperations
CREATE TABLE IF NOT EXISTS PlannedOperations (
    Id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId            BIGINT UNSIGNED   NOT NULL,
    AccountId         BIGINT UNSIGNED   NOT NULL,
    Amount            DECIMAL(18,2)     NOT NULL,
    Currency          VARCHAR(3)        NOT NULL,
    CategoryId        BIGINT UNSIGNED   NULL DEFAULT NULL,
    Tags              JSON              NULL DEFAULT NULL,
    Description       VARCHAR(500)      NULL DEFAULT NULL,
    OperationDate     DATE              NULL DEFAULT NULL,
    RecurrenceRuleId  BIGINT UNSIGNED   NULL DEFAULT NULL,
    IsConfirmed       TINYINT(1)        NOT NULL DEFAULT 0,
    ScenarioId        BIGINT UNSIGNED   NULL DEFAULT NULL,
    CreatedAt         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_planned_ops_user_date       (UserId, OperationDate),
    KEY idx_planned_ops_user_recurrence (UserId, RecurrenceRuleId),
    KEY idx_planned_ops_user_scenario   (UserId, ScenarioId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. ExchangeRates
CREATE TABLE IF NOT EXISTS ExchangeRates (
    FromCurrency  VARCHAR(3)     NOT NULL,
    ToCurrency    VARCHAR(3)     NOT NULL,
    Rate          DECIMAL(18,6)  NOT NULL,
    UpdatedAt     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (FromCurrency, ToCurrency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. BalanceSnapshots
CREATE TABLE IF NOT EXISTS BalanceSnapshots (
    Id            BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    AccountId     BIGINT UNSIGNED   NOT NULL,
    Currency      VARCHAR(3)        NOT NULL,
    Amount        DECIMAL(18,2)     NOT NULL,
    SnapshotDate  DATE              NOT NULL,
    Note          VARCHAR(500)      NULL DEFAULT NULL,
    CreatedAt     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_balance_snapshots_account_date (AccountId, SnapshotDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. CsvImportSessions
CREATE TABLE IF NOT EXISTS CsvImportSessions (
    Id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId              BIGINT UNSIGNED   NOT NULL,
    FileName            VARCHAR(500)      NOT NULL,
    ColumnMapping       JSON              NOT NULL,
    ImportedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    OperationsImported  INT               NOT NULL DEFAULT 0,

    PRIMARY KEY (Id),
    KEY idx_csv_import_user (UserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Foreign Keys
ALTER TABLE Accounts
    ADD CONSTRAINT fk_accounts_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

ALTER TABLE CurrencyBalances
    ADD CONSTRAINT fk_currency_balances_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

ALTER TABLE Categories
    ADD CONSTRAINT fk_categories_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

ALTER TABLE Categories
    ADD CONSTRAINT fk_categories_parent
        FOREIGN KEY (ParentId) REFERENCES Categories(Id) ON DELETE SET NULL;

ALTER TABLE Scenarios
    ADD CONSTRAINT fk_scenarios_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_category
        FOREIGN KEY (CategoryId) REFERENCES Categories(Id) ON DELETE SET NULL;

ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_recurrence
        FOREIGN KEY (RecurrenceRuleId) REFERENCES RecurrenceRules(Id) ON DELETE SET NULL;

ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_scenario
        FOREIGN KEY (ScenarioId) REFERENCES Scenarios(Id) ON DELETE CASCADE;

ALTER TABLE BalanceSnapshots
    ADD CONSTRAINT fk_balance_snapshots_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

ALTER TABLE CsvImportSessions
    ADD CONSTRAINT fk_csv_import_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;
