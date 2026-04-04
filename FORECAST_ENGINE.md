# FORECAST_ENGINE.md — CashPulse

Зафиксировано: 2026-04-05  
Версия: 1.0  
Язык реализации: C# / ASP.NET Core 8

Этот документ — **source of truth** для движка прогнозирования денежного потока.  
Код должен строго следовать этим спецификациям. Любые отклонения фиксируются в `## Решения агента`.

---

## Глоссарий

| Термин                  | Определение                                                                             |
|-------------------------|-----------------------------------------------------------------------------------------|
| **PlannedOperation**    | Запись в БД: разовая или шаблонная (с RecurrenceRuleId) запланированная операция        |
| **ProjectedOperation**  | Вычисленная операция с конкретной датой; результат развёртывания RecurrenceRule         |
| **Timeline**            | Хронологический ряд точек баланса для пары (AccountId, Currency)                        |
| **BalancePoint**        | Точка на Timeline: {Date, Balance}                                                      |
| **Net Worth**           | Суммарный капитал пользователя во всех счетах и валютах, конвертированный в BaseCurrency|
| **Horizon**             | Диапазон дат прогноза [horizonStart, horizonEnd]                                        |
| **BaseCurrency**        | Валюта пользователя из Users.BaseCurrency (по умолчанию RUB)                            |
| **CreditUsed**          | Использованная сумма кредитного лимита = abs(balance) если balance < 0                  |

---

## Публичный API движка

Движок реализован как сервис `ForecastEngine` с единственным публичным методом:

```csharp
public ForecastResult Calculate(ForecastRequest request);

public record ForecastRequest
{
    // Текущие балансы: [AccountId → [Currency → Amount]]
    public required Dictionary<long, Dictionary<string, decimal>> CurrentBalances { get; init; }

    // Все PlannedOperations пользователя (разовые + шаблоны с RecurrenceRule)
    public required List<PlannedOperation> PlannedOperations { get; init; }

    // Правила повторения, индексированные по Id
    public required Dictionary<long, RecurrenceRule> RecurrenceRules { get; init; }

    // Метаданные аккаунтов (тип, кредитные параметры)
    public required Dictionary<long, Account> Accounts { get; init; }

    // Курсы валют: ключ = "USD_RUB", значение = Rate
    public required Dictionary<string, decimal> ExchangeRates { get; init; }

    // Базовая валюта пользователя
    public required string BaseCurrency { get; init; }

    // Начало горизонта (обычно сегодня, UTC Date)
    public required DateOnly HorizonStart { get; init; }

    // Конец горизонта (HorizonStart + 3/6/12 месяцев)
    public required DateOnly HorizonEnd { get; init; }
}

public record ForecastResult
{
    // Timelines по каждой паре (AccountId, Currency)
    public required List<AccountTimeline> AccountTimelines { get; init; }

    // Net Worth timeline в BaseCurrency
    public required List<NetWorthPoint> NetWorthTimeline { get; init; }

    // Сводка по месяцам
    public required List<MonthlyBreakdown> MonthlyBreakdowns { get; init; }

    // Все алерты
    public required List<ForecastAlert> Alerts { get; init; }

    // Агрегация по тегам
    public required List<TagSummary> TagSummaries { get; init; }

    // Время расчёта (UTC)
    public required DateTime CalculatedAt { get; init; }
}
```

---

## 2.1 Развёртывание повторяющихся операций (Recurrence Expansion)

### Входные данные

```csharp
RecurrenceRule rule            // правило повторения
PlannedOperation template      // шаблон операции (Amount, Currency, AccountId, ...)
DateOnly horizonStart          // начало горизонта (включительно)
DateOnly horizonEnd            // конец горизонта (включительно)
```

### Выходные данные

```csharp
List<ProjectedOperation>

public record ProjectedOperation
{
    public DateOnly Date { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; }
    public long AccountId { get; init; }
    public long? CategoryId { get; init; }
    public List<string>? Tags { get; init; }
    public string? Description { get; init; }
    public long TemplateOperationId { get; init; }   // Id исходного PlannedOperation
    public long? ScenarioId { get; init; }
    public bool IsRecurring { get; init; } = true;
}
```

### Алгоритм

#### Шаг 1: Вычислить эффективный диапазон генерации

```
effectiveStart = Max(rule.StartDate, horizonStart)
effectiveEnd   = Min(rule.EndDate ?? DateOnly.MaxValue, horizonEnd)

Если effectiveStart > effectiveEnd → вернуть пустой список (правило не попадает в горизонт)
```

#### Шаг 2: Генерация дат по типу правила

**daily:**
```
current = effectiveStart
while current <= effectiveEnd:
    yield current
    current = current.AddDays(1)
```

**weekly:**
```
// rule.DaysOfWeek — массив DayOfWeek (0=Sunday, 1=Monday, ..., 6=Saturday)
current = effectiveStart
while current <= effectiveEnd:
    if (int)current.DayOfWeek ∈ rule.DaysOfWeek:
        yield current
    current = current.AddDays(1)
```

**biweekly:**
```
// Отсчёт от rule.StartDate с шагом 14 дней
current = rule.StartDate
while current < effectiveStart:
    current = current.AddDays(14)
// Теперь current >= effectiveStart
while current <= effectiveEnd:
    yield current
    current = current.AddDays(14)
```

**monthly:**
```
// Генерируем даты для каждого месяца в [effectiveStart.Year/Month, effectiveEnd.Year/Month]
startMonth = new YearMonth(effectiveStart.Year, effectiveStart.Month)
endMonth   = new YearMonth(effectiveEnd.Year, effectiveEnd.Month)

for each month M from startMonth to endMonth:
    date = ResolveMonthlyDate(M.Year, M.Month, rule.DayOfMonth)
    if date >= effectiveStart AND date <= effectiveEnd:
        yield date

// ResolveMonthlyDate(year, month, dayOfMonth):
//   daysInMonth = DateTime.DaysInMonth(year, month)
//   if dayOfMonth == -1 → return new DateOnly(year, month, daysInMonth)
//   if dayOfMonth > daysInMonth → return new DateOnly(year, month, daysInMonth)
//   return new DateOnly(year, month, dayOfMonth)
```

**quarterly:**
```
// Каждые 3 месяца, начиная с rule.StartDate
current = rule.StartDate
while current < effectiveStart:
    current = current.AddMonths(3)
while current <= effectiveEnd:
    yield ResolveMonthlyDate(current.Year, current.Month, rule.DayOfMonth)
    current = current.AddMonths(3)

// Примечание: ResolveMonthlyDate применяется для корректной обработки конца месяца
```

**yearly:**
```
current = rule.StartDate
while current < effectiveStart:
    current = current.AddYears(1)
while current <= effectiveEnd:
    // Обработка 29 февраля: если год невисокосный, берём 28 февраля
    date = SafeAddYears(rule.StartDate, current.Year - rule.StartDate.Year)
    if date >= effectiveStart AND date <= effectiveEnd:
        yield date
    current = current.AddYears(1)

// SafeAddYears(startDate, years):
//   try: return startDate.AddYears(years)
//   catch ArgumentOutOfRangeException: return new DateOnly(startDate.Year + years, 2, 28)
```

**custom:**
```
// Каждые rule.Interval_ дней от rule.StartDate
interval = rule.Interval_  // >= 1
current = rule.StartDate
while current < effectiveStart:
    current = current.AddDays(interval)
while current <= effectiveEnd:
    yield current
    current = current.AddDays(interval)
```

#### Шаг 3: Маппинг дат в ProjectedOperation

Для каждой сгенерированной даты `d`:
```csharp
new ProjectedOperation
{
    Date                = d,
    Amount              = template.Amount,
    Currency            = template.Currency,
    AccountId           = template.AccountId,
    CategoryId          = template.CategoryId,
    Tags                = template.Tags,
    Description         = template.Description,
    TemplateOperationId = template.Id,
    ScenarioId          = template.ScenarioId,
    IsRecurring         = true
}
```

### Ограничения производительности

- Для `daily` на горизонте 12 месяцев: ~365 операций — допустимо
- Для `weekly` с 7 дней недели на 12 месяцев: ~365 операций — допустимо
- Жёсткий лимит: если генерация возвращает > 10 000 операций для одного правила → выбросить исключение `RecurrenceExpansionOverflowException` с сообщением для пользователя

---

## 2.2 Построение прогноза (Forecast Projection)

### Шаг 1: Подготовка списка операций

```
allOperations = []

for each PlannedOperation op in request.PlannedOperations:
    // Пропускаем операции из неактивных сценариев
    if op.ScenarioId != null:
        scenario = request.Scenarios[op.ScenarioId]
        if !scenario.IsActive: continue

    if op.RecurrenceRuleId != null:
        // Повторяющаяся операция: развернуть
        rule = request.RecurrenceRules[op.RecurrenceRuleId]
        projected = ExpandRecurrence(rule, op, request.HorizonStart, request.HorizonEnd)
        allOperations.AddRange(projected)
    else:
        // Разовая операция: включить если попадает в горизонт
        if op.OperationDate >= request.HorizonStart AND op.OperationDate <= request.HorizonEnd:
            allOperations.Add(ToProjectedOperation(op))
```

### Шаг 2: Построение Account Timelines

Для каждой уникальной пары `(AccountId, Currency)`:

```
// Определяем все уникальные пары (AccountId, Currency) из:
// а) currentBalances
// б) операций в allOperations

for each (accountId, currency) pair:
    // Начальная точка
    initialBalance = request.CurrentBalances
                        .GetValueOrDefault(accountId)?
                        .GetValueOrDefault(currency, 0m) ?? 0m

    timeline = new AccountTimeline
    {
        AccountId = accountId,
        Currency  = currency,
        Points    = [ new BalancePoint { Date = request.HorizonStart, Balance = initialBalance } ]
    }

    // Собираем операции для этой пары, сортируем по Date
    opsForPair = allOperations
        .Where(o => o.AccountId == accountId && o.Currency == currency)
        .OrderBy(o => o.Date)
        .ToList()

    runningBalance = initialBalance
    for each op in opsForPair:
        runningBalance += op.Amount
        timeline.Points.Add(new BalancePoint
        {
            Date       = op.Date,
            Balance    = runningBalance,
            IsScenario = op.ScenarioId != null,
            OperationId = op.TemplateOperationId
        })

    accountTimelines.Add(timeline)
```

### Шаг 3: Net Worth Timeline

```
// Собираем все уникальные даты из всех timelines + horizonStart
allDates = accountTimelines
    .SelectMany(t => t.Points.Select(p => p.Date))
    .Distinct()
    .OrderBy(d => d)
    .ToList()

if (!allDates.Contains(request.HorizonStart))
    allDates.Insert(0, request.HorizonStart)

netWorthTimeline = []

for each date d in allDates:
    totalNetWorth = 0m
    for each timeline t in accountTimelines:
        // Последняя известная точка на дату d (≤ d)
        lastPoint = t.Points
            .Where(p => p.Date <= d)
            .OrderByDescending(p => p.Date)
            .FirstOrDefault()

        if lastPoint == null: continue

        balance = lastPoint.Balance
        rateKey = $"{t.Currency}_{request.BaseCurrency}"

        if t.Currency == request.BaseCurrency:
            convertedBalance = balance
        else if request.ExchangeRates.TryGetValue(rateKey, out rate):
            convertedBalance = balance * rate
        else:
            convertedBalance = balance  // fallback: rate=1.0
            // Алерт MISSING_EXCHANGE_RATE генерируется в §2.4

        totalNetWorth += convertedBalance

    netWorthTimeline.Add(new NetWorthPoint
    {
        Date     = d,
        Amount   = totalNetWorth,
        Currency = request.BaseCurrency
    })
```

### Шаг 4: Monthly Breakdown

```
// Разбиваем горизонт на полные месяцы
months = GetMonthsInRange(request.HorizonStart, request.HorizonEnd)

for each (year, month) in months:
    monthStart = new DateOnly(year, month, 1)
    monthEnd   = new DateOnly(year, month, DateTime.DaysInMonth(year, month))

    // Операции в этом месяце
    monthOps = allOperations
        .Where(o => o.Date >= monthStart && o.Date <= monthEnd)
        .ToList()

    income  = monthOps.Where(o => o.Amount > 0).Sum(o => ToBaseCurrency(o.Amount, o.Currency))
    expense = monthOps.Where(o => o.Amount < 0).Sum(o => ToBaseCurrency(o.Amount, o.Currency))

    // Net worth на конец месяца
    endOfMonthNetWorth = netWorthTimeline
        .Where(p => p.Date <= monthEnd)
        .OrderByDescending(p => p.Date)
        .FirstOrDefault()?.Amount ?? 0m

    // Разбивка по категориям (в BaseCurrency)
    byCategory = monthOps
        .GroupBy(o => o.CategoryId)
        .ToDictionary(
            g => g.Key,
            g => g.Sum(o => ToBaseCurrency(o.Amount, o.Currency))
        )

    monthlyBreakdowns.Add(new MonthlyBreakdown
    {
        Year          = year,
        Month         = month,
        Income        = income,
        Expense       = expense,
        EndBalance    = endOfMonthNetWorth,
        ByCategory    = byCategory
    })

// ToBaseCurrency(amount, currency):
//   if currency == baseCurrency: return amount
//   rateKey = $"{currency}_{baseCurrency}"
//   if ExchangeRates.TryGetValue(rateKey, out rate): return amount * rate
//   return amount  // fallback
```

---

## 2.3 Логика кредитных карт

Применяется только для аккаунтов с `Account.Type == "credit"`.

### Определение CreditUsed

```csharp
decimal GetCreditUsed(decimal balance)
{
    return balance < 0 ? Math.Abs(balance) : 0m;
}
```

### Вычисление дат выписки и оплаты

Для каждого месяца в горизонте для кредитного аккаунта:

```
statementDate = ResolveMonthlyDate(year, month, account.StatementDay)
dueDate       = statementDate.AddDays(account.GracePeriodDays)

// Если dueDate переходит в следующий месяц — это нормально
```

### Определение баланса на дату выписки

```
balanceAtStatement = GetLastBalanceBeforeOrAt(timeline, statementDate)
creditUsedAtStatement = GetCreditUsed(balanceAtStatement)
```

### Минимальный платёж (виртуальное предупреждение)

```
if creditUsedAtStatement > 0:
    minPayment = creditUsedAtStatement * account.MinPaymentPercent / 100

    // Проверяем: есть ли реальная операция погашения в (statementDate, dueDate]
    hasRepayment = allOperations.Any(o =>
        o.AccountId == account.Id
        && o.Amount > 0                          // пополнение кредитки = погашение
        && o.Date > statementDate
        && o.Date <= dueDate
    )

    if !hasRepayment:
        // Генерируем виртуальную операцию-предупреждение (НЕ добавляем в allOperations)
        virtualWarning = new CreditPaymentWarning
        {
            AccountId   = account.Id,
            DueDate     = dueDate,
            MinPayment  = minPayment,
            CreditUsed  = creditUsedAtStatement,
            Currency    = timeline.Currency
        }
        creditWarnings.Add(virtualWarning)
```

---

## 2.4 Детекция рисков и алерты

Алерты генерируются в отдельном проходе после построения timelines.

### Структура алерта

```csharp
public record ForecastAlert
{
    public required ForecastAlertType Type { get; init; }
    public required AlertSeverity Severity { get; init; }
    public required DateOnly Date { get; init; }
    public long? AccountId { get; init; }
    public required string Message { get; init; }
    public required string SuggestedAction { get; init; }
}

public enum ForecastAlertType
{
    BalanceBelowZero,
    BalanceBelowThreshold,
    CreditGraceExpiry,
    CreditOverLimit,
    NetWorthDeclining,
    CrossCurrencyOpportunity,
    MissingExchangeRate
}

public enum AlertSeverity { Info, Warning, Critical }
```

### Правила генерации алертов

#### BALANCE_BELOW_ZERO

```
Применяется к: аккаунты типа debit, cash
Проход: по каждой точке AccountTimeline

for each BalancePoint point in timeline.Points:
    if account.Type ∈ {debit, cash} AND point.Balance < 0:
        // Дедупликация: генерируем только для первой точки ухода в минус
        if нет предыдущей точки с Balance < 0:
            alerts.Add(new ForecastAlert
            {
                Type          = BalanceBelowZero,
                Severity      = Critical,
                Date          = point.Date,
                AccountId     = timeline.AccountId,
                Message       = $"Счёт '{account.Name}' уйдёт в минус {point.Date:dd.MM.yyyy}: {point.Balance:F2} {timeline.Currency}",
                SuggestedAction = "Пополните счёт или перенесите расходы"
            })
```

#### BALANCE_BELOW_THRESHOLD

```
Порог: 50 000 RUB или эквивалент
Применяется к: аккаунты типа debit, cash, investment

Пересчёт порога в валюту аккаунта:
    thresholdInCurrency = ConvertFromBase(50_000m, timeline.Currency)
    // ConvertFromBase(amountInBase, targetCurrency):
    //   if targetCurrency == baseCurrency: return amountInBase
    //   rateKey = $"{baseCurrency}_{targetCurrency}"
    //   return ExchangeRates.TryGetValue(rateKey, out r) ? amountInBase * r : amountInBase

for each BalancePoint point in timeline.Points:
    if point.Balance < thresholdInCurrency AND point.Balance >= 0:
        // Дедупликация: не дублировать для соседних точек ниже порога
        previousPoint = GetPreviousPoint(timeline, point)
        if previousPoint == null OR previousPoint.Balance >= thresholdInCurrency:
            alerts.Add(new ForecastAlert
            {
                Type          = BalanceBelowThreshold,
                Severity      = Warning,
                Date          = point.Date,
                AccountId     = timeline.AccountId,
                Message       = $"Низкий баланс на счёте '{account.Name}': {point.Balance:F2} {timeline.Currency}",
                SuggestedAction = "Запланируйте пополнение"
            })
```

#### CREDIT_GRACE_EXPIRY

```
Применяется к: аккаунты типа credit

for each (statementDate, dueDate, creditUsedAtStatement) in кредитные циклы:
    if creditUsedAtStatement <= 0: continue

    daysUntilDue = (dueDate - today).Days
    // today = request.HorizonStart

    severity = daysUntilDue <= 3 ? Critical : Warning
    // Генерируем только если daysUntilDue <= 7

    if daysUntilDue <= 7:
        alerts.Add(new ForecastAlert
        {
            Type          = CreditGraceExpiry,
            Severity      = severity,
            Date          = dueDate,
            AccountId     = account.Id,
            Message       = $"Оплатите кредит '{account.Name}': {creditUsedAtStatement:F2} {currency} до {dueDate:dd.MM.yyyy}",
            SuggestedAction = "Создайте операцию погашения"
        })
```

#### CREDIT_OVER_LIMIT

```
Применяется к: аккаунты типа credit с CreditLimit != null

for each BalancePoint point in creditTimeline.Points:
    creditUsed = GetCreditUsed(point.Balance)
    if creditUsed > account.CreditLimit:
        alerts.Add(new ForecastAlert
        {
            Type          = CreditOverLimit,
            Severity      = Critical,
            Date          = point.Date,
            AccountId     = account.Id,
            Message       = $"Превышен лимит кредитки '{account.Name}': использовано {creditUsed:F2}, лимит {account.CreditLimit:F2} {currency}",
            SuggestedAction = "Срочно погасите задолженность"
        })
```

#### NET_WORTH_DECLINING

```
// Анализируем Monthly Breakdown для Net Worth
monthlyNetWorth = monthlyBreakdowns
    .OrderBy(m => (m.Year, m.Month))
    .Select(m => m.EndBalance)
    .ToList()

consecutiveDeclines = 0
maxConsecutiveDeclines = 0
firstDeclineMonth = null

for i from 1 to monthlyNetWorth.Count - 1:
    if monthlyNetWorth[i] < monthlyNetWorth[i-1]:
        consecutiveDeclines++
        if firstDeclineMonth == null:
            firstDeclineMonth = monthlyBreakdowns[i]
    else:
        // Сбрасываем счётчик и проверяем накопленный
        if consecutiveDeclines >= 3:
            alerts.Add(new ForecastAlert
            {
                Type          = NetWorthDeclining,
                Severity      = Info,
                Date          = DateOnly.FromDateTime(DateTime.Today),
                AccountId     = null,
                Message       = $"Ваш net worth снижается {consecutiveDeclines} месяцев подряд",
                SuggestedAction = "Проверьте структуру расходов"
            })
        consecutiveDeclines = 0
        firstDeclineMonth = null

// Проверить последовательность в конце
if consecutiveDeclines >= 3:
    alerts.Add(...)
```

#### CROSS_CURRENCY_OPPORTUNITY

```
// Для каждой даты в Net Worth Timeline
for each date d:
    // Проверяем: есть ли дебетовый/кэш счёт в RUB с отрицательным балансом
    rubDeficitAccounts = accountTimelines
        .Where(t => t.Currency == "RUB"
                 && GetLastBalance(t, d) < 0
                 && request.Accounts[t.AccountId].Type ∈ {debit, cash})
        .ToList()

    if rubDeficitAccounts.IsEmpty: continue

    // Есть ли положительные балансы в USD/EUR?
    surplusFxAccounts = accountTimelines
        .Where(t => t.Currency ∈ {"USD", "EUR"}
                 && GetLastBalance(t, d) > 0)
        .ToList()

    if surplusFxAccounts.IsEmpty: continue

    // Дедупликация: один алерт на дату
    if !alertedDates.Contains(d):
        alertedDates.Add(d)
        fxCurrencies = string.Join(", ", surplusFxAccounts.Select(t => t.Currency).Distinct())
        alerts.Add(new ForecastAlert
        {
            Type          = CrossCurrencyOpportunity,
            Severity      = Info,
            Date          = d,
            AccountId     = null,
            Message       = $"Возможна конвертация {fxCurrencies} → RUB для покрытия дефицита",
            SuggestedAction = "Рассмотрите конвертацию валюты"
        })
```

#### MISSING_EXCHANGE_RATE

```
// Генерируется во время конвертации в Net Worth (§2.2, Шаг 3)
// и во время ToBaseCurrency (§2.2, Шаг 4)

if !request.ExchangeRates.ContainsKey($"{currency}_{baseCurrency}"):
    if !missingRateAlerted.Contains(currency):
        missingRateAlerted.Add(currency)
        alerts.Add(new ForecastAlert
        {
            Type          = MissingExchangeRate,
            Severity      = Warning,
            Date          = request.HorizonStart,
            AccountId     = null,
            Message       = $"Курс {currency} → {baseCurrency} не найден, использован курс 1.0",
            SuggestedAction = "Обновите курсы валют в настройках"
        })
```

---

## 2.5 Мультивалютная логика

### Принципы

1. **Изоляция валютных потоков**: прогноз строится по каждой паре `(AccountId, Currency)` независимо. Операции не конвертируются на уровне Account Timelines.

2. **Конвертация только для агрегатов**: конвертация в `BaseCurrency` происходит исключительно при:
   - Расчёте Net Worth (§2.2, Шаг 3)
   - Расчёте Monthly Breakdown (§2.2, Шаг 4)
   - Агрегации по тегам (§2.6)

3. **Фиксированные курсы**: курс фиксируется на момент запуска расчёта; исторические курсы не используются.

4. **Поддерживаемые пары курсов**:

```
RUB → RUB = 1.0       (тождество)
USD → RUB = [из ЦБ]
EUR → RUB = [из ЦБ]
RUB → USD = 1 / (USD→RUB)
RUB → EUR = 1 / (EUR→RUB)
USD → EUR = (USD→RUB) / (EUR→RUB)
EUR → USD = (EUR→RUB) / (USD→RUB)
```

Кросс-курсы `USD→EUR` и `EUR→USD` вычисляются приложением при обновлении и сохраняются в `ExchangeRates`.

5. **Fallback**: если пара курсов отсутствует → использовать `1.0` + алерт `MISSING_EXCHANGE_RATE`.

### Вспомогательные методы конвертации

```csharp
// Конвертировать сумму из sourceCurrency в targetCurrency
decimal Convert(decimal amount, string sourceCurrency, string targetCurrency,
                Dictionary<string, decimal> rates)
{
    if (sourceCurrency == targetCurrency) return amount;

    var key = $"{sourceCurrency}_{targetCurrency}";
    return rates.TryGetValue(key, out var rate) ? amount * rate : amount;
}

// Конвертировать в BaseCurrency
decimal ToBaseCurrency(decimal amount, string currency,
                       Dictionary<string, decimal> rates, string baseCurrency)
    => Convert(amount, currency, baseCurrency, rates);

// Конвертировать из BaseCurrency
decimal FromBaseCurrency(decimal amount, string targetCurrency,
                         Dictionary<string, decimal> rates, string baseCurrency)
    => Convert(amount, baseCurrency, targetCurrency, rates);
```

---

## 2.6 Агрегация по тегам

Для каждого уникального тега среди всех `PlannedOperations` пользователя (независимо от горизонта):

```csharp
public record TagSummary
{
    public required string Tag { get; init; }
    public required int OperationCount { get; init; }
    public required decimal TotalConfirmed { get; init; }  // Amount с IsConfirmed=true
    public required decimal TotalPlanned { get; init; }    // Amount с IsConfirmed=false
    public required decimal Total { get; init; }           // TotalConfirmed + TotalPlanned
    public required string Currency { get; init; }         // BaseCurrency
}
```

### Алгоритм

```
// Шаг 1: Собираем все теги из всех PlannedOperations пользователя
allTags = request.PlannedOperations
    .Where(op => op.Tags != null)
    .SelectMany(op => op.Tags)
    .Distinct()
    .ToList()

// Шаг 2: Для каждого тега агрегируем
for each tag in allTags:
    tagOps = request.PlannedOperations
        .Where(op => op.Tags != null && op.Tags.Contains(tag))
        .ToList()

    totalConfirmed = tagOps
        .Where(op => op.IsConfirmed)
        .Sum(op => ToBaseCurrency(op.Amount, op.Currency))

    totalPlanned = tagOps
        .Where(op => !op.IsConfirmed)
        .Sum(op => ToBaseCurrency(op.Amount, op.Currency))

    tagSummaries.Add(new TagSummary
    {
        Tag            = tag,
        OperationCount = tagOps.Count,
        TotalConfirmed = totalConfirmed,
        TotalPlanned   = totalPlanned,
        Total          = totalConfirmed + totalPlanned,
        Currency       = request.BaseCurrency
    })
```

**Примечание:** Агрегация тегов не ограничивается горизонтом прогноза — учитываются все операции, включая прошедшие. Это позволяет отслеживать бюджет на проект от начала до конца (например, «Тайланд-2026» включает все расходы за весь период поездки).

---

## Модели данных движка

```csharp
public record AccountTimeline
{
    public required long AccountId { get; init; }
    public required string Currency { get; init; }
    public required List<BalancePoint> Points { get; init; }
}

public record BalancePoint
{
    public required DateOnly Date { get; init; }
    public required decimal Balance { get; init; }
    public bool IsScenario { get; init; } = false;
    public long? OperationId { get; init; }
}

public record NetWorthPoint
{
    public required DateOnly Date { get; init; }
    public required decimal Amount { get; init; }
    public required string Currency { get; init; }
}

public record MonthlyBreakdown
{
    public required int Year { get; init; }
    public required int Month { get; init; }
    public required decimal Income { get; init; }
    public required decimal Expense { get; init; }
    public required decimal EndBalance { get; init; }
    public required Dictionary<long?, decimal> ByCategory { get; init; }
}

public record CreditPaymentWarning
{
    public required long AccountId { get; init; }
    public required DateOnly DueDate { get; init; }
    public required decimal MinPayment { get; init; }
    public required decimal CreditUsed { get; init; }
    public required string Currency { get; init; }
}
```

---

## Порядок вызовов в Calculate()

```
1. ExpandAllRecurrences()       → allProjectedOperations
2. BuildAccountTimelines()      → accountTimelines
3. BuildNetWorthTimeline()      → netWorthTimeline        (использует accountTimelines)
4. BuildMonthlyBreakdowns()     → monthlyBreakdowns       (использует allOps + netWorthTimeline)
5. DetectCreditCycles()         → creditCycles            (использует accountTimelines)
6. GenerateAlerts()             → alerts                  (использует всё вышеперечисленное)
7. AggregateByTags()            → tagSummaries            (использует request.PlannedOperations)
8. Собрать ForecastResult
```

---

## Решения агента

### Решение 1: Дедупликация алертов

Инструкция не специфицировала дедупликацию. Добавлена логика:
- `BALANCE_BELOW_ZERO`: только при первом переходе через 0 (не дублировать каждую точку ниже нуля)
- `BALANCE_BELOW_THRESHOLD`: только при переходе через порог (не для каждой точки ниже порога)
- `CROSS_CURRENCY_OPPORTUNITY`: один алерт на уникальную дату
- `MISSING_EXCHANGE_RATE`: один алерт на уникальную валютную пару

Без дедупликации на горизонте 12 месяцев daily-операций могли генерироваться сотни дублирующих алертов.

### Решение 2: MissingExchangeRate как отдельный тип алерта

В инструкции описано как «добавить алерт "Курс {currency} не найден"» без явного типа. Добавлен явный тип `MissingExchangeRate` со Severity=Warning для программной обработки на фронтенде.

### Решение 3: Агрегация тегов не ограничена горизонтом

Инструкция гласит «для каждого уникального тега среди PlannedOperations пользователя» без упоминания горизонта. Агрегация намеренно включает все операции (прошлые и будущие), чтобы tag-бюджеты типа «Тайланд-2026» отображали полную картину.

### Решение 4: Жёсткий лимит 10 000 операций на recurrence

Инструкция не устанавливала ограничения. Добавлен защитный лимит для предотвращения OOM при некорректных правилах (например, daily на 100 лет).

### Решение 5: Кросс-курсы в ExchangeRates

Инструкция описывает только пары с RUB. Добавлены кросс-курсы `USD→EUR` и `EUR→USD` (вычисляемые через RUB), чтобы мультивалютные аккаунты корректно конвертировались в Net Worth независимо от BaseCurrency.

### Решение 6: `CreditPaymentWarning` не попадает в `allOperations`

Инструкция явно указала: «генерируем виртуальную операцию MinPayment как предупреждение (не добавляем в факт)». `CreditPaymentWarning` — отдельная структура, возвращаемая в `ForecastResult` как часть `Alerts` (тип `CreditGraceExpiry`), но не влияет на балансы.

### Решение 7: Не добавлен UpdatedAt в Scenarios

Таблица `Scenarios` в `DATA_MODEL.md` не имеет `UpdatedAt` — сценарий создаётся/активируется/удаляется, но не редактируется по содержимому. Движок прогноза не нуждается в этом поле.
