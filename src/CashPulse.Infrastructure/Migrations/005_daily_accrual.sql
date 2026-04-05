ALTER TABLE Accounts
    ADD COLUMN DailyAccrual TINYINT(1) NULL DEFAULT NULL
        COMMENT '1 = проценты начисляются каждый день (как Райффайзен), NULL/0 = в день InterestAccrualDay';
