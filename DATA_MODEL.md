# DATA_MODEL.md — CashPulse

Зафиксировано: 2026-04-05  
Версия: 1.0  
СУБД: MySQL 8.0+  
ORM: Dapper (raw SQL, без миграционного фреймворка, кастомный migration runner)

---

## Общие соглашения

- Все `Id` — `BIGINT UNSIGNED AUTO_INCREMENT` (беззнаковые, т.к. отрицательных первичных ключей не бывает)
- Все `UserId` — `BIGINT UNSIGNED NOT NULL` с FK на `Users(Id)`, обеспечивают multi-tenant изоляцию
- `DATETIME` хранятся в UTC; приложение конвертирует в локальное время при отображении
- `DECIMAL(18,2)` для денежных сумм (18 цифр, 2 знака после запятой)
- `DECIMAL(18,6)` для курсов валют (6 знаков для точности при конвертации)
- `VARCHAR(3)` для кодов валют (ISO 4217: RUB, USD, EUR и т.д.)
- `JSON` — нативный тип MySQL 8, используется для слабоструктурированных полей
- Кодировка: `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` (поддержка эмодзи и кириллицы)
- `ENGINE=InnoDB` для всех таблиц (транзакции, FK, ACID)

---

## Схема таблиц

### 1. Users

Хранит пользователей системы. В MVP — один хардкоженный пользователь с Id=1.  
GoogleSubjectId остаётся NULL в MVP; заполняется при подключении OAuth.

```sql
CREATE TABLE Users (
    Id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
    GoogleSubjectId VARCHAR(255)     NULL         DEFAULT NULL,
    Email         VARCHAR(255)       NOT NULL,
    DisplayName   VARCHAR(255)       NOT NULL,
    BaseCurrency  VARCHAR(3)         NOT NULL     DEFAULT 'RUB',
    CreatedAt     DATETIME           NOT NULL     DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt     DATETIME           NOT NULL     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    UNIQUE KEY uq_users_google_subject_id (GoogleSubjectId),
    UNIQUE KEY uq_users_email (Email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- `Email` уникален — нужен для будущего OAuth-поиска пользователя по email
- `GoogleSubjectId` уникален (NULL разрешён, т.к. MySQL допускает несколько NULL в UNIQUE)
- `BaseCurrency` — код валюты из `ExchangeRates`; используется для расчёта Net Worth
- MVP: при старте приложения INSERT IGNORE пользователя с Id=1, Email='dev@local', DisplayName='Dev User'

---

### 2. Accounts

Финансовые счета пользователя: дебетовые карты, кредитки, инвест-счета, наличные.  
Поля `CreditLimit`, `GracePeriodDays`, `MinPaymentPercent`, `StatementDay`, `DueDay` — только для `Type='credit'`, для остальных типов должны быть NULL (валидация на уровне приложения).

```sql
CREATE TABLE Accounts (
    Id                 BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId             BIGINT UNSIGNED   NOT NULL,
    Name               VARCHAR(255)      NOT NULL,
    Type               ENUM('debit','credit','investment','cash') NOT NULL,
    CreditLimit        DECIMAL(18,2)     NULL DEFAULT NULL,
    GracePeriodDays    INT               NULL DEFAULT NULL,
    MinPaymentPercent  DECIMAL(5,2)      NULL DEFAULT NULL,
    StatementDay       INT               NULL DEFAULT NULL COMMENT 'День месяца формирования выписки (1-31)',
    DueDay             INT               NULL DEFAULT NULL COMMENT 'День месяца оплаты (1-31)',
    IsArchived         TINYINT(1)        NOT NULL DEFAULT 0,
    SortOrder          INT               NOT NULL DEFAULT 0,
    CreatedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_accounts_user_archived (UserId, IsArchived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- `StatementDay` и `DueDay` — 1..31; значение 31 означает «последнее число месяца» (логика в движке прогноза)
- `MinPaymentPercent` — 0.01..100.00
- `SortOrder` — порядок отображения в UI (меньше = выше); по умолчанию 0, фронт управляет drag-and-drop
- Архивированные счета не участвуют в прогнозе, но исторические данные сохраняются

---

### 3. CurrencyBalances

Текущий актуальный баланс каждого валютного суб-счёта.  
Один счёт может иметь несколько валют (например, мультивалютная карта: RUB + USD + EUR).

```sql
CREATE TABLE CurrencyBalances (
    AccountId  BIGINT UNSIGNED   NOT NULL,
    Currency   VARCHAR(3)        NOT NULL,
    Amount     DECIMAL(18,2)     NOT NULL DEFAULT 0,

    PRIMARY KEY (AccountId, Currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- Составной PK `(AccountId, Currency)` гарантирует уникальность суб-счёта
- `Amount` может быть отрицательным для кредитных счетов (использованный кредит)
- Обновляется при ручном вводе баланса пользователем или при применении снимка (`BalanceSnapshots`)
- FK на Accounts добавляется отдельным ALTER TABLE (см. раздел FK)

---

### 4. Categories

Иерархические категории операций. Поддерживает два уровня: родительские и дочерние.  
Системные категории (`IsSystem=true`) создаются при инициализации БД и не удаляются пользователем.

```sql
CREATE TABLE Categories (
    Id         BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId     BIGINT UNSIGNED   NOT NULL,
    Name       VARCHAR(255)      NOT NULL,
    ParentId   BIGINT UNSIGNED   NULL DEFAULT NULL,
    Icon       VARCHAR(50)       NULL DEFAULT NULL  COMMENT 'Имя иконки Mantine/Tabler',
    Color      VARCHAR(7)        NULL DEFAULT NULL  COMMENT 'HEX-цвет, например #FF5733',
    IsSystem   TINYINT(1)        NOT NULL DEFAULT 0,
    SortOrder  INT               NOT NULL DEFAULT 0,

    PRIMARY KEY (Id),
    KEY idx_categories_user (UserId),
    KEY idx_categories_parent (ParentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Системные категории (seed-данные):**

| Id | UserId | Name                  | ParentId | IsSystem | SortOrder |
|----|--------|-----------------------|----------|----------|-----------|
| 1  | 1      | Доходы                | NULL     | 1        | 0         |
| 2  | 1      | ЗП                    | 1        | 1        | 0         |
| 3  | 1      | Инвестиции (доход)    | 1        | 1        | 1         |
| 4  | 1      | Прочие доходы         | 1        | 1        | 2         |
| 5  | 1      | Расходы               | NULL     | 1        | 1         |
| 6  | 1      | Ипотека               | 5        | 1        | 0         |
| 7  | 1      | Кредитка (погашение)  | 5        | 1        | 1         |
| 8  | 1      | Быт                   | 5        | 1        | 2         |
| 9  | 1      | Продукты              | 8        | 1        | 0         |
| 10 | 1      | Рестораны/Кафе        | 8        | 1        | 1         |
| 11 | 1      | Подписки              | 8        | 1        | 2         |
| 12 | 1      | Транспорт             | 5        | 1        | 3         |
| 13 | 1      | Поездки               | 5        | 1        | 4         |
| 14 | 1      | Ремонт                | 5        | 1        | 5         |
| 15 | 1      | Здоровье/Медицина     | 5        | 1        | 6         |
| 16 | 1      | Образование           | 5        | 1        | 7         |
| 17 | 1      | Прочее                | 5        | 1        | 8         |

Итого системных категорий: **17** (15 листовых + 2 корневых «Доходы» и «Расходы»).

**Инварианты:**
- Глубина иерархии — максимум 2 уровня (корень → листья); ограничение на уровне приложения
- `IsSystem=true` → пользователь не может удалить или переименовать категорию
- `ParentId` → самореференция; `ON DELETE SET NULL` (если родитель удалён, дочерние становятся корневыми)
- `Icon` — имя иконки из набора Tabler Icons (используется в Mantine)
- `Color` — валидация формата `#RRGGBB` на уровне приложения

---

### 5. RecurrenceRules

Правила повторения для операций. Хранятся отдельно от операций для переиспользования.

```sql
CREATE TABLE RecurrenceRules (
    Id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    Type         ENUM('daily','weekly','biweekly','monthly','quarterly','yearly','custom') NOT NULL,
    DayOfMonth   INT               NULL DEFAULT NULL COMMENT '1-31 или -1 для последнего дня месяца',
    Interval_    INT               NULL DEFAULT NULL COMMENT 'Для custom: каждые N дней (N >= 1)',
    DaysOfWeek   JSON              NULL DEFAULT NULL COMMENT 'Для weekly: массив [0..6], 0=воскресенье',
    StartDate    DATE              NOT NULL,
    EndDate      DATE              NULL DEFAULT NULL COMMENT 'NULL = бессрочно',

    PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- `Interval_` — подчёркивание суффикс потому что `INTERVAL` — зарезервированное слово SQL; в C# модели маппится как `Interval`
- `DayOfMonth=-1` → последний день месяца
- `DayOfMonth > 28` → движок прогноза применяет логику «последний день месяца» при переполнении
- `DaysOfWeek` — JSON-массив целых чисел, например `[1, 3, 5]` (пн, ср, пт)
- `StartDate` — дата первого вхождения (включительно)
- `EndDate` — дата последнего вхождения (включительно); NULL = до горизонта прогноза

**Валидация типа:**
| Type        | Обязательные поля  | Необязательные |
|-------------|--------------------|----------------|
| daily       | —                  | —              |
| weekly      | DaysOfWeek         | —              |
| biweekly    | —                  | —              |
| monthly     | DayOfMonth         | —              |
| quarterly   | DayOfMonth         | —              |
| yearly      | DayOfMonth         | —              |
| custom      | Interval_          | —              |

---

### 6. Scenarios

Сценарии планирования («оптимистичный», «пессимистичный» и т.д.).  
Операции, привязанные к сценарию, включаются в прогноз только когда `IsActive=true`.

```sql
CREATE TABLE Scenarios (
    Id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId      BIGINT UNSIGNED   NOT NULL,
    Name        VARCHAR(255)      NOT NULL,
    Description TEXT              NULL DEFAULT NULL,
    IsActive    TINYINT(1)        NOT NULL DEFAULT 0,
    CreatedAt   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    KEY idx_scenarios_user_active (UserId, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- Несколько сценариев могут быть активны одновременно
- Операции без `ScenarioId` — базовый прогноз (всегда включаются)
- Операции с `ScenarioId` — включаются только при `Scenarios.IsActive=true`
- `UpdatedAt` намеренно отсутствует: сценарий не редактируется, только создаётся/удаляется/активируется

---

### 7. PlannedOperations

Центральная таблица: запланированные и шаблонные операции.  
Разовые операции: `RecurrenceRuleId IS NULL`, `OperationDate NOT NULL`.  
Повторяющиеся: `RecurrenceRuleId NOT NULL`, `OperationDate IS NULL` (дата генерируется движком).

```sql
CREATE TABLE PlannedOperations (
    Id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId            BIGINT UNSIGNED   NOT NULL,
    AccountId         BIGINT UNSIGNED   NOT NULL,
    Amount            DECIMAL(18,2)     NOT NULL COMMENT 'Положительное=доход, отрицательное=расход',
    Currency          VARCHAR(3)        NOT NULL,
    CategoryId        BIGINT UNSIGNED   NULL DEFAULT NULL,
    Tags              JSON              NULL DEFAULT NULL COMMENT 'Массив строк, например ["Тайланд-2026"]',
    Description       VARCHAR(500)      NULL DEFAULT NULL,
    OperationDate     DATE              NULL DEFAULT NULL COMMENT 'Для разовых операций',
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
```

**Инварианты:**
- `Amount > 0` → доход; `Amount < 0` → расход; `Amount = 0` запрещён (валидация на уровне API)
- `(OperationDate IS NULL) XOR (RecurrenceRuleId IS NULL)` → ровно одно из двух должно быть заполнено (ограничение уровня приложения, не CHECK, т.к. MySQL 8 поддерживает CHECK, но Dapper не генерирует их автоматически)
- `Tags` — JSON-массив строк; приложение нормализует теги (trim, lowercase)
- `IsConfirmed=true` → операция подтверждена пользователем (влияет на агрегацию тегов)
- При `ScenarioId IS NULL` и `RecurrenceRuleId IS NULL` → разовая базовая операция

---

### 8. ExchangeRates

Кэш курсов валют. Обновляется по расписанию из ЦБ РФ XML API.  
Хранит прямые и обратные курсы для быстрой конвертации.

```sql
CREATE TABLE ExchangeRates (
    FromCurrency  VARCHAR(3)     NOT NULL,
    ToCurrency    VARCHAR(3)     NOT NULL,
    Rate          DECIMAL(18,6)  NOT NULL,
    UpdatedAt     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (FromCurrency, ToCurrency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Seed-данные (инициализация):**

```sql
INSERT INTO ExchangeRates (FromCurrency, ToCurrency, Rate) VALUES
('RUB', 'RUB', 1.000000),
('USD', 'RUB', 90.000000),  -- placeholder, обновляется из ЦБ
('EUR', 'RUB', 98.000000),  -- placeholder, обновляется из ЦБ
('RUB', 'USD', 0.011111),   -- 1/90, обновляется синхронно
('RUB', 'EUR', 0.010204);   -- 1/98, обновляется синхронно
```

**Инварианты:**
- `Rate > 0` всегда
- При обновлении USD→RUB автоматически обновляется RUB→USD = 1/Rate (логика в сервисе)
- `UpdatedAt` используется для определения свежести курса (если > 24 часа — предупреждение в UI)
- Fallback: если курс не найден, движок прогноза использует `1.0` и генерирует алерт типа `MISSING_EXCHANGE_RATE`

---

### 9. BalanceSnapshots

Исторические снимки балансов. Используются для:
1. Ручной корректировки баланса пользователем
2. Верификации прогноза с фактом
3. Будущей функции «план vs факт»

```sql
CREATE TABLE BalanceSnapshots (
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
```

**Инварианты:**
- Несколько снимков для одного `(AccountId, Currency, SnapshotDate)` допустимы (пользователь мог обновить несколько раз)
- Самый последний по `CreatedAt` снимок за дату считается актуальным
- При применении снимка приложение обновляет `CurrencyBalances.Amount` для соответствующей пары
- `Note` — произвольный комментарий пользователя («после зарплаты», «после покупки авто»)

---

### 10. CsvImportSessions

Метаданные сессий импорта CSV. Сами операции, импортированные из CSV, хранятся в `PlannedOperations`.

```sql
CREATE TABLE CsvImportSessions (
    Id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    UserId              BIGINT UNSIGNED   NOT NULL,
    FileName            VARCHAR(500)      NOT NULL,
    ColumnMapping       JSON              NOT NULL COMMENT 'Маппинг колонок CSV → поля модели',
    ImportedAt          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    OperationsImported  INT               NOT NULL DEFAULT 0,

    PRIMARY KEY (Id),
    KEY idx_csv_import_user (UserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Структура `ColumnMapping` JSON:**

```json
{
  "date": "Дата",
  "amount": "Сумма",
  "currency": "Валюта",
  "description": "Описание",
  "category": "Категория"
}
```

Ключи — поля модели `PlannedOperation`, значения — заголовки столбцов в CSV-файле.

---

### 11. _migrations

Внутренняя таблица кастомного migration runner. Хранит список применённых миграций.

```sql
CREATE TABLE _migrations (
    Id          INT           NOT NULL AUTO_INCREMENT,
    FileName    VARCHAR(255)  NOT NULL,
    AppliedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (Id),
    UNIQUE KEY uq_migrations_filename (FileName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Инварианты:**
- Файлы миграций именуются: `V001__create_users.sql`, `V002__create_accounts.sql` и т.д.
- Runner выполняет файлы в лексикографическом порядке по `FileName`
- Идемпотентность: если `FileName` уже есть в таблице, файл пропускается
- Каждый файл — одна атомарная транзакция

---

## Внешние ключи (ALTER TABLE)

Добавляются после создания всех таблиц (для избежания проблем с порядком):

```sql
-- Accounts → Users
ALTER TABLE Accounts
    ADD CONSTRAINT fk_accounts_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

-- CurrencyBalances → Accounts
ALTER TABLE CurrencyBalances
    ADD CONSTRAINT fk_currency_balances_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

-- Categories → Users
ALTER TABLE Categories
    ADD CONSTRAINT fk_categories_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

-- Categories → Categories (самореференция)
ALTER TABLE Categories
    ADD CONSTRAINT fk_categories_parent
        FOREIGN KEY (ParentId) REFERENCES Categories(Id) ON DELETE SET NULL;

-- Scenarios → Users
ALTER TABLE Scenarios
    ADD CONSTRAINT fk_scenarios_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

-- PlannedOperations → Users
ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;

-- PlannedOperations → Accounts
ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

-- PlannedOperations → Categories
ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_category
        FOREIGN KEY (CategoryId) REFERENCES Categories(Id) ON DELETE SET NULL;

-- PlannedOperations → RecurrenceRules
ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_recurrence
        FOREIGN KEY (RecurrenceRuleId) REFERENCES RecurrenceRules(Id) ON DELETE SET NULL;

-- PlannedOperations → Scenarios
ALTER TABLE PlannedOperations
    ADD CONSTRAINT fk_planned_ops_scenario
        FOREIGN KEY (ScenarioId) REFERENCES Scenarios(Id) ON DELETE CASCADE;

-- BalanceSnapshots → Accounts
ALTER TABLE BalanceSnapshots
    ADD CONSTRAINT fk_balance_snapshots_account
        FOREIGN KEY (AccountId) REFERENCES Accounts(Id) ON DELETE CASCADE;

-- CsvImportSessions → Users
ALTER TABLE CsvImportSessions
    ADD CONSTRAINT fk_csv_import_user
        FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE;
```

---

## Сводная таблица индексов

| Таблица             | Индекс                              | Поля                          | Цель                                      |
|---------------------|-------------------------------------|-------------------------------|-------------------------------------------|
| Users               | uq_users_google_subject_id          | GoogleSubjectId               | Поиск по OAuth sub                        |
| Users               | uq_users_email                      | Email                         | Поиск при логине                          |
| Accounts            | idx_accounts_user_archived          | UserId, IsArchived            | Список активных счетов пользователя       |
| Categories          | idx_categories_user                 | UserId                        | Список категорий пользователя             |
| Categories          | idx_categories_parent               | ParentId                      | Получение дочерних категорий              |
| Scenarios           | idx_scenarios_user_active           | UserId, IsActive              | Список активных сценариев                 |
| PlannedOperations   | idx_planned_ops_user_date           | UserId, OperationDate         | Все операции пользователя за период       |
| PlannedOperations   | idx_planned_ops_user_recurrence     | UserId, RecurrenceRuleId      | Повторяющиеся операции пользователя       |
| PlannedOperations   | idx_planned_ops_user_scenario       | UserId, ScenarioId            | Операции по сценарию                      |
| BalanceSnapshots    | idx_balance_snapshots_account_date  | AccountId, SnapshotDate       | Снимки по счёту за период                 |
| CsvImportSessions   | idx_csv_import_user                 | UserId                        | История импортов пользователя             |
| _migrations         | uq_migrations_filename              | FileName                      | Идемпотентность миграций                  |

---

## Порядок создания таблиц (с учётом FK-зависимостей)

```
1.  _migrations          (нет FK)
2.  Users                (нет FK)
3.  RecurrenceRules      (нет FK)
4.  Accounts             (FK → Users)
5.  CurrencyBalances     (FK → Accounts)
6.  Categories           (FK → Users, self-ref)
7.  Scenarios            (FK → Users)
8.  PlannedOperations    (FK → Users, Accounts, Categories, RecurrenceRules, Scenarios)
9.  ExchangeRates        (нет FK)
10. BalanceSnapshots     (FK → Accounts)
11. CsvImportSessions    (FK → Users)
```

---

## Решения агента

### Решение 1: BIGINT UNSIGNED вместо BIGINT

Инструкция указывала просто `BIGINT`. Использован `BIGINT UNSIGNED` для первичных и внешних ключей, поскольку отрицательные ID не имеют смысла, а беззнаковый тип вдвое увеличивает диапазон значений (до ~18.4 квинтиллионов). Это стандартная практика для MySQL.

### Решение 2: TINYINT(1) вместо BOOL

MySQL не имеет настоящего типа BOOL — он является алиасом для `TINYINT(1)`. Явное использование `TINYINT(1)` делает схему прозрачной и совместимой с Dapper (маппится на `bool` в C#).

### Решение 3: Добавлены корневые категории «Доходы» и «Расходы»

В USER_REQUIREMENTS.md указано 15 категорий без явных корневых групп. Добавлены 2 корневые категории (`ParentId=NULL`) «Доходы» и «Расходы» для правильной иерархии. Итого: 17 записей вместо 15. Это не меняет функциональность — листовые категории те же.

### Решение 4: Имя колонки `Interval_` вместо `Interval`

`INTERVAL` — зарезервированное слово в MySQL. Использован суффикс подчёркивания в DDL. В C# модели Dapper-маппинг настраивается через атрибут `[Column("Interval_")]`, а свойство называется `Interval`.

### Решение 5: Таблица ExchangeRates без UserId

Курсы валют глобальны (не per-user). Нет смысла дублировать одни и те же данные ЦБ РФ для каждого пользователя. Если в будущем понадобятся персональные курсы (ручной ввод), добавить отдельную таблицу `UserExchangeRateOverrides`.

### Решение 6: ON DELETE SET NULL для RecurrenceRuleId в PlannedOperations

Если правило повторения удаляется, операция-шаблон превращается в «осиротевшую» разовую запись, но не удаляется. Это предотвращает потерю данных. Приложение должно обрабатывать `RecurrenceRuleId IS NULL` как разовую операцию.
