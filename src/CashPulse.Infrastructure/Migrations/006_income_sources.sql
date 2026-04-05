-- Migration 006: Income Sources, Tranches, Distribution Rules
-- Applied automatically by MigrationRunner on application start

CREATE TABLE IF NOT EXISTS IncomeSources (
    Id              BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId          BIGINT UNSIGNED   NOT NULL,
    Name            VARCHAR(255)      NOT NULL,
    Currency        VARCHAR(3)        NOT NULL DEFAULT 'RUB',
    ExpectedTotal   DECIMAL(18,2)     NULL DEFAULT NULL,
    IsActive        TINYINT(1)        NOT NULL DEFAULT 1,
    Description     VARCHAR(500)      NULL DEFAULT NULL,
    CreatedAt       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    KEY idx_income_sources_user_active (UserId, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS IncomeTranches (
    Id              BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    IncomeSourceId  BIGINT UNSIGNED   NOT NULL,
    Name            VARCHAR(255)      NOT NULL,
    DayOfMonth      INT               NOT NULL,
    AmountMode      TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    FixedAmount     DECIMAL(18,2)     NULL DEFAULT NULL,
    PercentOfTotal  DECIMAL(7,4)      NULL DEFAULT NULL,
    EstimatedMin    DECIMAL(18,2)     NULL DEFAULT NULL,
    EstimatedMax    DECIMAL(18,2)     NULL DEFAULT NULL,
    SortOrder       INT               NOT NULL DEFAULT 0,
    CreatedAt       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    KEY idx_income_tranches_source (IncomeSourceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS DistributionRules (
    Id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    TrancheId   BIGINT UNSIGNED   NOT NULL,
    AccountId   BIGINT UNSIGNED   NOT NULL,
    Currency    VARCHAR(3)        NULL DEFAULT NULL,
    ValueMode   TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    Percent     DECIMAL(7,4)      NULL DEFAULT NULL,
    FixedAmount DECIMAL(18,2)     NULL DEFAULT NULL,
    DelayDays   INT               NOT NULL DEFAULT 0,
    CategoryId  BIGINT UNSIGNED   NULL DEFAULT NULL,
    Tags        JSON              NULL DEFAULT NULL,
    SortOrder   INT               NOT NULL DEFAULT 0,
    PRIMARY KEY (Id),
    KEY idx_distribution_rules_tranche (TrancheId),
    KEY idx_distribution_rules_account (AccountId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE IncomeSources
    ADD CONSTRAINT fk_income_sources_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

ALTER TABLE IncomeTranches
    ADD CONSTRAINT fk_income_tranches_source
        FOREIGN KEY (IncomeSourceId) REFERENCES IncomeSources(Id) ON DELETE CASCADE;

ALTER TABLE DistributionRules
    ADD CONSTRAINT fk_distribution_rules_tranche
        FOREIGN KEY (TrancheId) REFERENCES IncomeTranches(Id) ON DELETE CASCADE;

ALTER TABLE DistributionRules
    ADD CONSTRAINT fk_distribution_rules_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;
