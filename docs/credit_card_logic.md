# Спецификация логики кредитных карт

Версия: 1.0  
Дата: 2026-04-05  
Относится к: `ForecastEngine`, `Account` model, UI-формы счетов

---

## Поля Account для кредитных карт

Применяется только к аккаунтам с `Account.Type == AccountType.Credit`.

| Поле | Тип C# | Тип БД | Статус | Описание |
|------|--------|--------|--------|----------|
| `CreditLimit` | `decimal?` | `DECIMAL(18,2) NULL` | Актуально | Кредитный лимит в валюте счёта. Пример: `150000.00`. |
| `GracePeriodDays` | `int?` | `INT NULL` | Актуально (справочно) | Длительность беспроцентного периода в днях (например, 100). Информационное поле — не используется для расчёта дедлайна. Актуальный дедлайн — в `GracePeriodEndDate`. |
| `MinPaymentPercent` | `decimal?` | `DECIMAL(5,2) NULL` | Актуально | Минимальный платёж в % от задолженности. Пример: `5.00` = 5%. |
| `StatementDay` | `int?` | `INT NULL` | **Устарело** | День формирования выписки. Поле остаётся в БД для обратной совместимости, **скрыть в UI**. Больше не используется в бизнес-логике ForecastEngine. |
| `DueDay` | `int?` | `INT NULL` | Актуально | День месяца, до которого нужно внести минимальный платёж. Используется для ежемесячных алертов. |
| `GracePeriodEndDate` | `DateOnly?` | `DATE NULL` | **Новое (миграция 004)** | Конкретная дата окончания текущего беспроцентного периода. Пользователь вводит вручную. Используется для генерации алертов `CreditGraceExpiry`. |

---

## Семантика баланса кредитки

**Принятое решение**: баланс кредитки = долг (всегда ≤ 0 или 0).

```
balance = -10 000  →  пользователь должен банку 10 000
balance =  0       →  долга нет
```

**Запрещено**: баланс кредитки не может быть положительным в нормальной ситуации.  
Положительный баланс (например, после переплаты) обрабатывается как `CreditUsed = 0`.

### Вычисление CreditUsed

```csharp
decimal GetCreditUsed(decimal balance)
{
    // balance < 0 → долг есть
    // balance >= 0 → долга нет (например, переплата)
    return balance < 0 ? Math.Abs(balance) : 0m;
}
```

### Доступный остаток лимита

```csharp
decimal GetAvailableCredit(decimal balance, decimal? creditLimit)
{
    if (creditLimit is null) return 0m;
    var creditUsed = GetCreditUsed(balance);
    return Math.Max(0m, creditLimit.Value - creditUsed);
}
```

### Участие в Net Worth

```csharp
// Кредитка участвует в Net Worth только отрицательной частью.
// Лимит НЕ добавляется в активы.
decimal GetNetWorthContribution(decimal balance)
{
    return Math.Min(balance, 0m);
    // balance = -10 000  →  contribution = -10 000
    // balance = 0        →  contribution = 0
}
```

---

## Логика прогноза для кредитных карт

### 1. Алерт CREDIT_GRACE_EXPIRY (на основе GracePeriodEndDate)

Генерируется, если `account.GracePeriodEndDate != null` и счёт имеет задолженность.

```
today = request.HorizonStart

IF account.GracePeriodEndDate != null:
    graceEndDate = account.GracePeriodEndDate.Value
    
    // Получаем баланс на сегодня
    currentBalance = GetCurrentBalance(account, today)
    creditUsed     = GetCreditUsed(currentBalance)
    
    IF creditUsed <= 0:
        // Долга нет — алерт не нужен
        SKIP
    
    daysUntilExpiry = (graceEndDate.DayNumber - today.DayNumber)
    
    // Алерт за 14 дней до окончания
    IF daysUntilExpiry <= 14 AND daysUntilExpiry > 3:
        alerts.Add(new ForecastAlert
        {
            Type            = ForecastAlertType.CreditGraceExpiry,
            Severity        = AlertSeverity.Warning,
            Date            = graceEndDate,
            AccountId       = (long)account.Id,
            Message         = $"Беспроцентный период по '{account.Name}' заканчивается {graceEndDate:dd.MM.yyyy} — через {daysUntilExpiry} дн. Долг: {creditUsed:F2} {currency}",
            SuggestedAction = "Погасите задолженность до окончания льготного периода"
        })
    
    // Критический алерт за 3 дня и менее
    IF daysUntilExpiry <= 3 AND daysUntilExpiry >= 0:
        alerts.Add(new ForecastAlert
        {
            Type            = ForecastAlertType.CreditGraceExpiry,
            Severity        = AlertSeverity.Critical,
            Date            = graceEndDate,
            AccountId       = (long)account.Id,
            Message         = $"СРОЧНО: беспроцентный период по '{account.Name}' заканчивается {graceEndDate:dd.MM.yyyy}! Долг: {creditUsed:F2} {currency}",
            SuggestedAction = "Немедленно создайте операцию погашения"
        })
    
    // Просроченный grace period (daysUntilExpiry < 0)
    IF daysUntilExpiry < 0:
        alerts.Add(new ForecastAlert
        {
            Type            = ForecastAlertType.CreditGraceExpiry,
            Severity        = AlertSeverity.Critical,
            Date            = today,
            AccountId       = (long)account.Id,
            Message         = $"Беспроцентный период по '{account.Name}' истёк {graceEndDate:dd.MM.yyyy}. Начисляются проценты на долг {creditUsed:F2} {currency}",
            SuggestedAction = "Погасите задолженность и обновите дату льготного периода"
        })
```

### 2. Расчёт минимального платежа

```csharp
decimal GetMinPayment(decimal balance, decimal? minPaymentPercent)
{
    if (minPaymentPercent is null or <= 0) return 0m;
    
    var creditUsed = GetCreditUsed(balance);
    if (creditUsed <= 0) return 0m;
    
    return Math.Round(creditUsed * minPaymentPercent.Value / 100m, 2);
}
```

### 3. Алерт минимального платежа (на основе DueDay)

Для каждого месяца в горизонте, если `account.DueDay != null`:

```
FOR EACH month M in horizon:
    dueDate    = ResolveMonthlyDate(M.Year, M.Month, account.DueDay)
    balance    = GetLastBalanceBeforeOrAt(creditTimeline, dueDate)
    creditUsed = GetCreditUsed(balance)
    
    IF creditUsed <= 0: CONTINUE
    
    minPayment = GetMinPayment(balance, account.MinPaymentPercent)
    
    // Проверить: есть ли запланированное погашение до dueDate в этом месяце
    hasRepayment = allOperations.Any(o =>
        o.AccountId == (long)account.Id
        AND o.Amount > 0                     // погашение = положительная операция на кредитку
        AND o.Date >= new DateOnly(M.Year, M.Month, 1)
        AND o.Date <= dueDate
    )
    
    IF NOT hasRepayment:
        alerts.Add(new ForecastAlert
        {
            Type            = ForecastAlertType.CreditGraceExpiry,
            Severity        = AlertSeverity.Warning,
            Date            = dueDate,
            AccountId       = (long)account.Id,
            Message         = $"Минимальный платёж по '{account.Name}': {minPayment:F2} {currency} до {dueDate:dd.MM.yyyy}",
            SuggestedAction = $"Запланируйте операцию погашения на сумму не менее {minPayment:F2} {currency}"
        })
```

---

## Изменения в C# модели Account

Добавить поля в `Account.cs`:

```csharp
public class Account
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; }
    public decimal? CreditLimit { get; set; }
    public int? GracePeriodDays { get; set; }
    public decimal? MinPaymentPercent { get; set; }
    public int? StatementDay { get; set; }       // Устарело, скрыть в UI, оставить в модели
    public int? DueDay { get; set; }

    // --- Новые поля (миграция 004) ---
    public decimal? InterestRate { get; set; }
    public int? InterestAccrualDay { get; set; }
    public DateOnly? DepositEndDate { get; set; }
    public bool? CanTopUpAlways { get; set; }
    public bool? CanWithdraw { get; set; }
    public string? InvestmentSubtype { get; set; }  // "savings" | "bonds" | "stocks"
    public DateOnly? GracePeriodEndDate { get; set; }  // <-- ключевое для кредиток

    public bool IsArchived { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Loaded separately
    public List<CurrencyBalance> Balances { get; set; } = new();
}

public enum AccountType
{
    Debit,
    Credit,
    Investment,
    Cash,
    Deposit   // Новое значение (миграция 004)
}
```

---

## Изменения в UI

### Форма создания/редактирования кредитной карты

| Поле | Действие | UI-компонент | Подсказка |
|------|----------|--------------|-----------|
| `StatementDay` | **Скрыть** | — | Не отображать |
| `GracePeriodDays` | Оставить как readonly / info | Текстовое поле (read-only) | "Длительность беспроцентного периода по договору (дней)" |
| `GracePeriodEndDate` | **Добавить** | Date-picker | "Дата окончания текущего беспроцентного периода" |
| `DueDay` | Оставить | Number input (1–28) | "День месяца для внесения минимального платежа" |
| `MinPaymentPercent` | Оставить | Number input с `%` | "Минимальный платёж (% от задолженности)" |

### Отображение баланса кредитки в списке счетов

```
Текущее:   "Баланс: -10 000 ₽"   — неочевидно для пользователя
Новое:     "Долг: 10 000 ₽"      — показывать Math.Abs(balance)

Доступно:  "Доступно: 140 000 ₽" — CreditLimit - CreditUsed
```

### Строка "дней до конца беспроцентного периода"

Вместо неочевидного поля `StatementDay`:

```
IF GracePeriodEndDate != null:
    daysLeft = (GracePeriodEndDate - today).Days
    IF daysLeft > 0:
        Показать: "До конца льготного периода: {daysLeft} дн. ({GracePeriodEndDate:dd.MM.yyyy})"
    ELSE IF daysLeft == 0:
        Показать: "Льготный период заканчивается сегодня!"
    ELSE:
        Показать: "Льготный период истёк {|daysLeft|} дн. назад"
ELSE:
    Не показывать блок
```

---

## Неизменяемые инварианты

Эти правила должны соблюдаться во всём приложении:

1. `balance` кредитки хранится как отрицательное число или 0. Положительное значение недопустимо в бизнес-логике.
2. `CreditLimit` — всегда положительное число или NULL.
3. `GracePeriodEndDate` — дата в будущем при создании/обновлении (валидация на уровне API).
4. Net Worth: кредитный лимит **никогда** не добавляется в активы. Contribution = `Math.Min(balance, 0)`.
5. `MinPaymentPercent` — диапазон 0–100 (CHECK-констрейнт или валидация приложения).
