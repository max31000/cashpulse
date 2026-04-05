# Изменения схемы БД v2

Файл миграции: `004_deposits_investments_credit.sql`  
Продолжает нумерацию после `003_add_telegram_auth.sql`.  
Дата: 2026-04-05

---

## Новые значения enum AccountType

Текущий ENUM в `001_initial_schema.sql`:
```sql
ENUM('debit','credit','investment','cash')
```

Добавить значение `'deposit'`:
```sql
ENUM('debit','credit','investment','cash','deposit')
```

**Важно**: MySQL не позволяет добавить значение в ENUM через `ADD COLUMN` — требуется `MODIFY COLUMN` с полным перечислением допустимых значений. В MySQL 8.0+ `ALTER TABLE ... MODIFY COLUMN` для расширения ENUM не перестраивает таблицу (instant DDL), однако порядок значений имеет значение — новое значение добавляется в конец.

---

## Новые колонки в таблице Accounts

Проверка: поля `CreditLimit`, `GracePeriodDays`, `MinPaymentPercent`, `StatementDay`, `DueDay` уже существуют в `001_initial_schema.sql`. Добавлять их не нужно.

| Колонка | Тип MySQL | NULL | DEFAULT | Описание |
|---------|-----------|------|---------|----------|
| `InterestRate` | `DECIMAL(6,2)` | YES | NULL | Годовая процентная ставка в процентах. `16.00` = 16% годовых. При расчёте делить на 100. Используется для вкладов (`deposit`) и сберегательных инвестсчётов (`investment` с `InvestmentSubtype = 'savings'`). |
| `InterestAccrualDay` | `INT` | YES | NULL | День месяца начисления процентов. Допустимые значения: 1–28. Если фактическое число дней в месяце меньше значения поля — используется последний день месяца (fallback). Значение 29, 30, 31 недопустимо на уровне приложения; CHECK-констрейнт ниже. |
| `DepositEndDate` | `DATE` | YES | NULL | Дата окончания вклада. Начисления процентов не генерируются после этой даты. Для бессрочных счётов (`investment/savings`) — NULL. |
| `CanTopUpAlways` | `TINYINT(1)` | YES | NULL | Флаг пополнения вклада: `1` = пополнение доступно всегда, `0` = пополнение доступно только в первые 30 дней с `CreatedAt`. NULL означает «не применимо» (не вклад). |
| `CanWithdraw` | `TINYINT(1)` | YES | NULL | Флаг снятия: `1` = досрочное снятие доступно, `0` = снятие запрещено до `DepositEndDate`. NULL означает «не применимо» (не вклад). |
| `InvestmentSubtype` | `ENUM('savings','bonds','stocks')` | YES | NULL | Подтип инвестиционного счёта. Применимо только при `Type = 'investment'`. `savings` — сберегательный (начисляются проценты как у вклада), `bonds` — облигации, `stocks` — акции. NULL для всех других типов счётов. |
| `GracePeriodEndDate` | `DATE` | YES | NULL | Конкретная дата окончания беспроцентного периода для кредитной карты. Хранит актуальный дедлайн текущего льготного периода. Дополняет `GracePeriodDays` (справочное поле). Применимо только при `Type = 'credit'`. |

---

## Новые колонки в таблице PlannedOperations

**Колонки не добавляются.**

Согласно принятому решению №4: авто-операции (начисление процентов по вкладу, минимальные платежи по кредитке) генерируются исключительно в `ForecastEngine` на лету и не сохраняются в `PlannedOperations`. Для информационного отображения автоматических начислений используется отдельный endpoint (не требует изменений схемы).

---

## Новые индексы

```sql
-- Ускоряет выборку вкладов и инвестсчётов по дате окончания
-- (для ForecastEngine: найти все активные вклады с DepositEndDate в горизонте)
KEY idx_accounts_deposit_end_date (DepositEndDate)

-- Ускоряет выборку кредиток с истекающим grace period
-- (для ForecastEngine: найти credit-аккаунты с GracePeriodEndDate <= горизонт)
KEY idx_accounts_grace_period_end (GracePeriodEndDate)
```

Составной индекс `idx_accounts_user_archived (UserId, IsArchived)` уже существует в `001_initial_schema.sql` — не дублировать.

---

## Новые FK

Новые колонки не ссылаются на другие таблицы — внешние ключи не добавляются.

---

## Удаляемые / изменяемые колонки

| Действие | Колонка | Причина |
|----------|---------|---------|
| **Изменить** | `Accounts.Type` ENUM | Добавить значение `'deposit'` — требует `MODIFY COLUMN` |
| **Не удалять** | `Accounts.StatementDay` | Поле устарело (заменяется `GracePeriodEndDate` в бизнес-логике), но остаётся в БД для обратной совместимости. В UI скрыть. |

---

## Полный SQL для миграции 004

```sql
-- Migration 004: Deposits, investments subtypes, credit card grace period
-- Продолжает нумерацию после 003_add_telegram_auth.sql

-- =====================================================================
-- 1. Расширить ENUM AccountType: добавить 'deposit'
--    MODIFY COLUMN в MySQL 8.0 на расширение ENUM - instant DDL (не перестраивает таблицу)
-- =====================================================================
ALTER TABLE Accounts
    MODIFY COLUMN Type ENUM('debit','credit','investment','cash','deposit') NOT NULL;

-- =====================================================================
-- 2. Новые колонки для вкладов и инвестсчётов
-- =====================================================================
ALTER TABLE Accounts
    ADD COLUMN InterestRate       DECIMAL(6,2)                       NULL DEFAULT NULL
        COMMENT 'Годовая ставка в процентах (16.00 = 16%). Делить на 100 при расчёте.',
    ADD COLUMN InterestAccrualDay INT                                 NULL DEFAULT NULL
        COMMENT 'День месяца начисления процентов. Допустимо: 1-28. Fallback: последний день месяца.',
    ADD COLUMN DepositEndDate     DATE                                NULL DEFAULT NULL
        COMMENT 'Дата окончания вклада. NULL = бессрочный.',
    ADD COLUMN CanTopUpAlways     TINYINT(1)                         NULL DEFAULT NULL
        COMMENT '1 = пополнение всегда, 0 = только первые 30 дней с открытия.',
    ADD COLUMN CanWithdraw        TINYINT(1)                         NULL DEFAULT NULL
        COMMENT '1 = досрочное снятие разрешено, 0 = запрещено до DepositEndDate.',
    ADD COLUMN InvestmentSubtype  ENUM('savings','bonds','stocks')   NULL DEFAULT NULL
        COMMENT 'Подтип инвестсчёта. Применимо только при Type=investment.',
    ADD COLUMN GracePeriodEndDate DATE                               NULL DEFAULT NULL
        COMMENT 'Дата окончания беспроцентного периода кредитки. Применимо при Type=credit.';

-- =====================================================================
-- 3. CHECK-констрейнт на InterestAccrualDay
--    MySQL 8.0.16+ поддерживает CHECK CONSTRAINT
-- =====================================================================
ALTER TABLE Accounts
    ADD CONSTRAINT chk_interest_accrual_day
        CHECK (InterestAccrualDay IS NULL OR (InterestAccrualDay >= 1 AND InterestAccrualDay <= 28));

-- =====================================================================
-- 4. Индексы
-- =====================================================================
ALTER TABLE Accounts
    ADD KEY idx_accounts_deposit_end_date (DepositEndDate),
    ADD KEY idx_accounts_grace_period_end (GracePeriodEndDate);
```

---

## Порядок ALTER TABLE операций — обоснование

1. **MODIFY COLUMN Type** — выполняется первым отдельной операцией, так как MySQL не позволяет совмещать `MODIFY COLUMN` (изменение типа) с `ADD COLUMN` в одном `ALTER TABLE` без риска конфликтов при наличии данных.
2. **ADD COLUMN × 7** — объединены в один `ALTER TABLE` для минимизации блокировок (MySQL 8.0 выполняет как instant DDL, если все колонки имеют значение по умолчанию NULL).
3. **ADD CONSTRAINT CHECK** — отдельная операция, так как в MySQL 8.0 добавление CHECK-констрейнта требует отдельного ALTER или выполняется как часть ADD COLUMN (здесь выделен для ясности).
4. **ADD KEY × 2** — объединены в один ALTER TABLE.

> **Примечание**: В MySQL 8.0 расширение ENUM (добавление нового значения в конец) является instant operation и не вызывает полного перестроения таблицы (`ALTER TABLE ... MODIFY COLUMN` с добавлением значения в конец ENUM).
