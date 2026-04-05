using CashPulse.Core.Models;
using CashPulse.Core.Services;

namespace CashPulse.Core.Forecast;

public class ForecastEngine
{
    public ForecastResult Calculate(ForecastRequest request)
    {
        // Step 1: Expand all recurrences + collect one-time ops
        var allProjectedOperations = ExpandAllOperations(request);

        // Step 1b: Inject interest accruals for deposits and savings investment accounts
        var accrualService = new DepositAccrualService();
        foreach (var (accountId, account) in request.Accounts)
        {
            bool isDepositOrSavings = account.Type == AccountType.Deposit ||
                (account.Type == AccountType.Investment &&
                 account.InvestmentSubtype?.Equals("savings", StringComparison.OrdinalIgnoreCase) == true);

            if (!isDepositOrSavings || account.InterestRate == null) continue;

            if (!request.CurrentBalances.TryGetValue(accountId, out var balances)) continue;

            foreach (var (currency, balance) in balances)
            {
                if (balance <= 0) continue;
                var accruals = accrualService.GenerateAccruals(
                    account, balance, currency, request.HorizonStart, request.HorizonEnd);
                allProjectedOperations.AddRange(accruals);
            }
        }

        // Step 2: Build account timelines
        var accountTimelines = BuildAccountTimelines(request, allProjectedOperations);

        // Step 3: Build net worth timeline
        var netWorthTimeline = BuildNetWorthTimeline(request, accountTimelines);

        // Step 4: Build monthly breakdowns
        var monthlyBreakdowns = BuildMonthlyBreakdowns(request, allProjectedOperations, netWorthTimeline);

        // Step 5: Generate alerts
        var alerts = GenerateAlerts(request, accountTimelines, netWorthTimeline, monthlyBreakdowns, allProjectedOperations);

        // Step 6: Aggregate by tags
        var tagSummaries = AggregateByTags(request);

        return new ForecastResult
        {
            AccountTimelines = accountTimelines,
            NetWorthTimeline = netWorthTimeline,
            MonthlyBreakdowns = monthlyBreakdowns,
            Alerts = alerts,
            TagSummaries = tagSummaries,
            CalculatedAt = DateTime.UtcNow
        };
    }

    private List<ProjectedOperation> ExpandAllOperations(ForecastRequest request)
    {
        var allOperations = new List<ProjectedOperation>();

        foreach (var op in request.PlannedOperations)
        {
            // Skip operations from inactive scenarios
            if (op.ScenarioId.HasValue)
            {
                var scenarioId = (long)op.ScenarioId.Value;
                if (request.Scenarios.TryGetValue(scenarioId, out var scenario) && !scenario.IsActive)
                    continue;
            }

            if (op.RecurrenceRuleId.HasValue)
            {
                var ruleId = (long)op.RecurrenceRuleId.Value;
                if (request.RecurrenceRules.TryGetValue(ruleId, out var rule))
                {
                    var projected = RecurrenceExpander.Expand(rule, op, request.HorizonStart, request.HorizonEnd);
                    allOperations.AddRange(projected);
                }
            }
            else if (op.OperationDate.HasValue)
            {
                if (op.OperationDate.Value >= request.HorizonStart && op.OperationDate.Value <= request.HorizonEnd)
                {
                    allOperations.Add(ToProjectedOperation(op));
                }
            }
        }

        return allOperations;
    }

    private static ProjectedOperation ToProjectedOperation(PlannedOperation op)
    {
        return new ProjectedOperation
        {
            Date = op.OperationDate!.Value,
            Amount = op.Amount,
            Currency = op.Currency,
            AccountId = (long)op.AccountId,
            CategoryId = op.CategoryId.HasValue ? (long)op.CategoryId.Value : null,
            Tags = op.Tags,
            Description = op.Description,
            TemplateOperationId = (long)op.Id,
            ScenarioId = op.ScenarioId.HasValue ? (long)op.ScenarioId.Value : null,
            IsRecurring = false
        };
    }

    private List<AccountTimeline> BuildAccountTimelines(
        ForecastRequest request,
        List<ProjectedOperation> allOperations)
    {
        // Collect all unique (AccountId, Currency) pairs
        var pairs = new HashSet<(long AccountId, string Currency)>();

        foreach (var (accountId, balances) in request.CurrentBalances)
        {
            foreach (var currency in balances.Keys)
                pairs.Add((accountId, currency));
        }

        foreach (var op in allOperations)
            pairs.Add(((long)op.AccountId, op.Currency));

        var timelines = new List<AccountTimeline>();

        foreach (var (accountId, currency) in pairs)
        {
            var initialBalance = request.CurrentBalances
                .GetValueOrDefault(accountId)?
                .GetValueOrDefault(currency, 0m) ?? 0m;

            var points = new List<BalancePoint>
            {
                new BalancePoint
                {
                    Date = request.HorizonStart,
                    Balance = initialBalance,
                    IsScenario = false
                }
            };

            var opsForPair = allOperations
                .Where(o => o.AccountId == accountId && o.Currency == currency)
                .OrderBy(o => o.Date)
                .ToList();

            var runningBalance = initialBalance;
            foreach (var op in opsForPair)
            {
                runningBalance += op.Amount;
                points.Add(new BalancePoint
                {
                    Date = op.Date,
                    Balance = runningBalance,
                    IsScenario = op.ScenarioId.HasValue,
                    OperationId = op.TemplateOperationId
                });
            }

            timelines.Add(new AccountTimeline
            {
                AccountId = accountId,
                Currency = currency,
                Points = points
            });
        }

        return timelines;
    }

    private List<NetWorthPoint> BuildNetWorthTimeline(
        ForecastRequest request,
        List<AccountTimeline> accountTimelines)
    {
        var allDates = accountTimelines
            .SelectMany(t => t.Points.Select(p => p.Date))
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        if (!allDates.Contains(request.HorizonStart))
            allDates.Insert(0, request.HorizonStart);

        var missingRateAlerted = new HashSet<string>();
        var netWorthTimeline = new List<NetWorthPoint>();

        foreach (var date in allDates)
        {
            var totalNetWorth = 0m;

            foreach (var timeline in accountTimelines)
            {
                var lastPoint = timeline.Points
                    .Where(p => p.Date <= date)
                    .OrderByDescending(p => p.Date)
                    .FirstOrDefault();

                if (lastPoint == null) continue;

                var balanceAtDate = lastPoint.Balance;

                // Credit accounts contribute only the negative part (debt) to net worth
                var account = request.Accounts.GetValueOrDefault(timeline.AccountId);
                var effectiveBalance = account?.Type == AccountType.Credit
                    ? Math.Min(balanceAtDate, 0m)
                    : balanceAtDate;

                totalNetWorth += ConvertToBase(effectiveBalance, timeline.Currency, request.BaseCurrency, request.ExchangeRates);
            }

            netWorthTimeline.Add(new NetWorthPoint
            {
                Date = date,
                Amount = totalNetWorth,
                Currency = request.BaseCurrency
            });
        }

        return netWorthTimeline;
    }

    private List<MonthlyBreakdown> BuildMonthlyBreakdowns(
        ForecastRequest request,
        List<ProjectedOperation> allOperations,
        List<NetWorthPoint> netWorthTimeline)
    {
        var breakdowns = new List<MonthlyBreakdown>();

        var months = GetMonthsInRange(request.HorizonStart, request.HorizonEnd);

        foreach (var (year, month) in months)
        {
            var monthStart = new DateOnly(year, month, 1);
            var monthEnd = new DateOnly(year, month, DateTime.DaysInMonth(year, month));

            var monthOps = allOperations
                .Where(o => o.Date >= monthStart && o.Date <= monthEnd)
                .ToList();

            var income = monthOps
                .Where(o => o.Amount > 0)
                .Sum(o => ConvertToBase(o.Amount, o.Currency, request.BaseCurrency, request.ExchangeRates));

            var expense = monthOps
                .Where(o => o.Amount < 0)
                .Sum(o => ConvertToBase(o.Amount, o.Currency, request.BaseCurrency, request.ExchangeRates));

            var endOfMonthNetWorth = netWorthTimeline
                .Where(p => p.Date <= monthEnd)
                .OrderByDescending(p => p.Date)
                .FirstOrDefault()?.Amount ?? 0m;

            var byCategory = monthOps
                .Where(o => o.CategoryId.HasValue)
                .GroupBy(o => o.CategoryId)
                .ToDictionary(
                    g => g.Key,
                    g => g.Sum(o => ConvertToBase(o.Amount, o.Currency, request.BaseCurrency, request.ExchangeRates))
                );

            breakdowns.Add(new MonthlyBreakdown
            {
                Year = year,
                Month = month,
                Income = income,
                Expense = expense,
                EndBalance = endOfMonthNetWorth,
                ByCategory = byCategory
            });
        }

        return breakdowns;
    }

    private List<ForecastAlert> GenerateAlerts(
        ForecastRequest request,
        List<AccountTimeline> accountTimelines,
        List<NetWorthPoint> netWorthTimeline,
        List<MonthlyBreakdown> monthlyBreakdowns,
        List<ProjectedOperation> allOperations)
    {
        var alerts = new List<ForecastAlert>();
        var missingRateAlerted = new HashSet<string>();

        // Check for missing exchange rates
        foreach (var timeline in accountTimelines)
        {
            if (timeline.Currency != request.BaseCurrency)
            {
                var rateKey = $"{timeline.Currency}_{request.BaseCurrency}";
                if (!request.ExchangeRates.ContainsKey(rateKey) && !missingRateAlerted.Contains(timeline.Currency))
                {
                    missingRateAlerted.Add(timeline.Currency);
                    alerts.Add(new ForecastAlert
                    {
                        Type = ForecastAlertType.MissingExchangeRate,
                        Severity = AlertSeverity.Warning,
                        Date = request.HorizonStart,
                        AccountId = null,
                        Message = $"Курс {timeline.Currency} → {request.BaseCurrency} не найден, использован курс 1.0",
                        SuggestedAction = "Обновите курсы валют в настройках"
                    });
                }
            }
        }

        // Balance below zero / threshold alerts
        foreach (var timeline in accountTimelines)
        {
            if (!request.Accounts.TryGetValue(timeline.AccountId, out var account))
                continue;

            var thresholdInCurrency = ConvertFromBase(50_000m, timeline.Currency, request.BaseCurrency, request.ExchangeRates);

            bool wentBelowZero = false;
            bool wentBelowThreshold = false;
            decimal? prevBalance = null;

            foreach (var point in timeline.Points.OrderBy(p => p.Date))
            {
                // BALANCE_BELOW_ZERO (only for debit/cash)
                if (account.Type == AccountType.Debit || account.Type == AccountType.Cash)
                {
                    if (point.Balance < 0 && !wentBelowZero)
                    {
                        wentBelowZero = true;
                        alerts.Add(new ForecastAlert
                        {
                            Type = ForecastAlertType.BalanceBelowZero,
                            Severity = AlertSeverity.Critical,
                            Date = point.Date,
                            AccountId = timeline.AccountId,
                            Message = $"Счёт '{account.Name}' уйдёт в минус {point.Date:dd.MM.yyyy}: {point.Balance:F2} {timeline.Currency}",
                            SuggestedAction = "Пополните счёт или перенесите расходы"
                        });
                    }
                    if (point.Balance >= 0) wentBelowZero = false; // Reset if recovered
                }

                // BALANCE_BELOW_THRESHOLD (debit/cash/investment)
                if (account.Type != AccountType.Credit)
                {
                    var prevAboveThreshold = prevBalance == null || prevBalance >= thresholdInCurrency;
                    if (point.Balance < thresholdInCurrency && point.Balance >= 0 && prevAboveThreshold)
                    {
                        alerts.Add(new ForecastAlert
                        {
                            Type = ForecastAlertType.BalanceBelowThreshold,
                            Severity = AlertSeverity.Warning,
                            Date = point.Date,
                            AccountId = timeline.AccountId,
                            Message = $"Низкий баланс на счёте '{account.Name}': {point.Balance:F2} {timeline.Currency}",
                            SuggestedAction = "Запланируйте пополнение"
                        });
                    }
                }

                // CREDIT_OVER_LIMIT
                if (account.Type == AccountType.Credit && account.CreditLimit.HasValue)
                {
                    var creditUsed = GetCreditUsed(point.Balance);
                    if (creditUsed > account.CreditLimit.Value)
                    {
                        alerts.Add(new ForecastAlert
                        {
                            Type = ForecastAlertType.CreditOverLimit,
                            Severity = AlertSeverity.Critical,
                            Date = point.Date,
                            AccountId = timeline.AccountId,
                            Message = $"Превышен лимит кредитки '{account.Name}': использовано {creditUsed:F2}, лимит {account.CreditLimit.Value:F2} {timeline.Currency}",
                            SuggestedAction = "Срочно погасите задолженность"
                        });
                    }
                }

                prevBalance = point.Balance;
            }

            // CREDIT_GRACE_EXPIRY — GracePeriodEndDate-based (new logic)
            if (account.Type == AccountType.Credit && account.GracePeriodEndDate.HasValue)
            {
                GenerateCreditGraceExpiryAlerts(request, timeline, account, alerts);
            }
            // CREDIT_GRACE_EXPIRY — legacy StatementDay-based (kept for backwards compatibility)
            else if (account.Type == AccountType.Credit
                && account.StatementDay.HasValue
                && account.GracePeriodDays.HasValue
                && account.MinPaymentPercent.HasValue)
            {
                GenerateCreditGraceAlerts(request, timeline, account, allOperations, alerts);
            }
        }

        // NET_WORTH_DECLINING
        GenerateNetWorthDecliningAlerts(monthlyBreakdowns, alerts);

        // CROSS_CURRENCY_OPPORTUNITY
        GenerateCrossCurrencyAlerts(request, accountTimelines, netWorthTimeline, alerts);

        return alerts;
    }

    private static void GenerateCreditGraceExpiryAlerts(
        ForecastRequest request,
        AccountTimeline timeline,
        Account account,
        List<ForecastAlert> alerts)
    {
        var graceEnd = account.GracePeriodEndDate!.Value;
        var today = request.HorizonStart;

        var creditUsed = request.CurrentBalances.TryGetValue(timeline.AccountId, out var cb)
            ? cb.Values.Where(b => b < 0).Sum(b => Math.Abs(b))
            : 0m;

        if (creditUsed <= 0) return;

        var daysLeft = (graceEnd.ToDateTime(TimeOnly.MinValue) - today.ToDateTime(TimeOnly.MinValue)).Days;

        if (daysLeft < 0)
        {
            alerts.Add(new ForecastAlert
            {
                Type = ForecastAlertType.CreditGraceExpiry,
                Severity = AlertSeverity.Critical,
                Date = today,
                AccountId = timeline.AccountId,
                Message = $"Беспроцентный период по '{account.Name}' истёк! Долг {creditUsed:N0} — срочно погасите.",
                SuggestedAction = "Немедленно пополните счёт для погашения долга"
            });
        }
        else if (daysLeft <= 3)
        {
            alerts.Add(new ForecastAlert
            {
                Type = ForecastAlertType.CreditGraceExpiry,
                Severity = AlertSeverity.Critical,
                Date = graceEnd,
                AccountId = timeline.AccountId,
                Message = $"До конца беспроцентного периода '{account.Name}' {daysLeft} дн. Долг {creditUsed:N0}",
                SuggestedAction = "Погасите долг в ближайшие дни"
            });
        }
        else if (daysLeft <= 14)
        {
            alerts.Add(new ForecastAlert
            {
                Type = ForecastAlertType.CreditGraceExpiry,
                Severity = AlertSeverity.Warning,
                Date = graceEnd,
                AccountId = timeline.AccountId,
                Message = $"До конца беспроцентного периода '{account.Name}' {daysLeft} дн. Долг {creditUsed:N0}",
                SuggestedAction = "Запланируйте погашение долга"
            });
        }
    }

    private void GenerateCreditGraceAlerts(
        ForecastRequest request,
        AccountTimeline timeline,
        Account account,
        List<ProjectedOperation> allOperations,
        List<ForecastAlert> alerts)
    {
        var today = request.HorizonStart;
        var statementDay = account.StatementDay!.Value;
        var graceDays = account.GracePeriodDays!.Value;

        // Check each month in horizon
        var months = GetMonthsInRange(request.HorizonStart, request.HorizonEnd);
        foreach (var (year, month) in months)
        {
            var statementDate = RecurrenceExpander.ResolveMonthlyDate(year, month, statementDay);
            var dueDate = statementDate.AddDays(graceDays);

            var daysUntilDue = (dueDate.ToDateTime(TimeOnly.MinValue) - today.ToDateTime(TimeOnly.MinValue)).Days;
            if (daysUntilDue > 7) continue;

            var balanceAtStatement = timeline.Points
                .Where(p => p.Date <= statementDate)
                .OrderByDescending(p => p.Date)
                .FirstOrDefault()?.Balance ?? 0m;

            var creditUsed = GetCreditUsed(balanceAtStatement);
            if (creditUsed <= 0) continue;

            var severity = daysUntilDue <= 3 ? AlertSeverity.Critical : AlertSeverity.Warning;

            alerts.Add(new ForecastAlert
            {
                Type = ForecastAlertType.CreditGraceExpiry,
                Severity = severity,
                Date = dueDate,
                AccountId = timeline.AccountId,
                Message = $"Оплатите кредит '{account.Name}': {creditUsed:F2} {timeline.Currency} до {dueDate:dd.MM.yyyy}",
                SuggestedAction = "Создайте операцию погашения"
            });
        }
    }

    private static void GenerateNetWorthDecliningAlerts(
        List<MonthlyBreakdown> monthlyBreakdowns,
        List<ForecastAlert> alerts)
    {
        if (monthlyBreakdowns.Count < 2) return;

        var sorted = monthlyBreakdowns.OrderBy(m => (m.Year, m.Month)).ToList();
        var monthlyNetWorth = sorted.Select(m => m.EndBalance).ToList();

        var consecutiveDeclines = 0;
        DateOnly? firstDeclineDate = null;

        for (int i = 1; i < monthlyNetWorth.Count; i++)
        {
            if (monthlyNetWorth[i] < monthlyNetWorth[i - 1])
            {
                consecutiveDeclines++;
                if (firstDeclineDate == null)
                    firstDeclineDate = new DateOnly(sorted[i].Year, sorted[i].Month, 1);
            }
            else
            {
                if (consecutiveDeclines >= 3)
                {
                    alerts.Add(new ForecastAlert
                    {
                        Type = ForecastAlertType.NetWorthDeclining,
                        Severity = AlertSeverity.Info,
                        Date = firstDeclineDate!.Value,
                        AccountId = null,
                        Message = $"Ваш net worth снижается {consecutiveDeclines} месяцев подряд",
                        SuggestedAction = "Проверьте структуру расходов"
                    });
                }
                consecutiveDeclines = 0;
                firstDeclineDate = null;
            }
        }

        // Check at end of sequence
        if (consecutiveDeclines >= 3)
        {
            alerts.Add(new ForecastAlert
            {
                Type = ForecastAlertType.NetWorthDeclining,
                Severity = AlertSeverity.Info,
                Date = firstDeclineDate!.Value,
                AccountId = null,
                Message = $"Ваш net worth снижается {consecutiveDeclines} месяцев подряд",
                SuggestedAction = "Проверьте структуру расходов"
            });
        }
    }

    private static void GenerateCrossCurrencyAlerts(
        ForecastRequest request,
        List<AccountTimeline> accountTimelines,
        List<NetWorthPoint> netWorthTimeline,
        List<ForecastAlert> alerts)
    {
        var alertedDates = new HashSet<DateOnly>();

        foreach (var point in netWorthTimeline)
        {
            var date = point.Date;

            var rubDeficitAccounts = accountTimelines.Where(t =>
                t.Currency == "RUB"
                && request.Accounts.TryGetValue(t.AccountId, out var acc)
                && (acc.Type == AccountType.Debit || acc.Type == AccountType.Cash)
                && GetLastBalance(t, date) < 0)
                .ToList();

            if (!rubDeficitAccounts.Any()) continue;

            var surplusFxAccounts = accountTimelines.Where(t =>
                (t.Currency == "USD" || t.Currency == "EUR")
                && GetLastBalance(t, date) > 0)
                .ToList();

            if (!surplusFxAccounts.Any()) continue;

            if (!alertedDates.Contains(date))
            {
                alertedDates.Add(date);
                var fxCurrencies = string.Join(", ", surplusFxAccounts.Select(t => t.Currency).Distinct());
                alerts.Add(new ForecastAlert
                {
                    Type = ForecastAlertType.CrossCurrencyOpportunity,
                    Severity = AlertSeverity.Info,
                    Date = date,
                    AccountId = null,
                    Message = $"Возможна конвертация {fxCurrencies} → RUB для покрытия дефицита",
                    SuggestedAction = "Рассмотрите конвертацию валюты"
                });
            }
        }
    }

    private List<TagSummary> AggregateByTags(ForecastRequest request)
    {
        var allTags = request.PlannedOperations
            .Where(op => op.Tags != null)
            .SelectMany(op => op.Tags!)
            .Distinct()
            .ToList();

        var summaries = new List<TagSummary>();

        foreach (var tag in allTags)
        {
            var tagOps = request.PlannedOperations
                .Where(op => op.Tags != null && op.Tags.Contains(tag))
                .ToList();

            var totalConfirmed = tagOps
                .Where(op => op.IsConfirmed)
                .Sum(op => ConvertToBase(op.Amount, op.Currency, request.BaseCurrency, request.ExchangeRates));

            var totalPlanned = tagOps
                .Where(op => !op.IsConfirmed)
                .Sum(op => ConvertToBase(op.Amount, op.Currency, request.BaseCurrency, request.ExchangeRates));

            summaries.Add(new TagSummary
            {
                Tag = tag,
                OperationCount = tagOps.Count,
                TotalConfirmed = totalConfirmed,
                TotalPlanned = totalPlanned,
                Total = totalConfirmed + totalPlanned,
                Currency = request.BaseCurrency
            });
        }

        return summaries;
    }

    private static decimal ConvertToBase(decimal amount, string currency, string baseCurrency, Dictionary<string, decimal> rates)
    {
        if (currency == baseCurrency) return amount;
        var key = $"{currency}_{baseCurrency}";
        return rates.TryGetValue(key, out var rate) ? amount * rate : amount;
    }

    private static decimal ConvertFromBase(decimal amount, string targetCurrency, string baseCurrency, Dictionary<string, decimal> rates)
    {
        if (targetCurrency == baseCurrency) return amount;
        var key = $"{baseCurrency}_{targetCurrency}";
        return rates.TryGetValue(key, out var rate) ? amount * rate : amount;
    }

    private static decimal GetCreditUsed(decimal balance) => balance < 0 ? Math.Abs(balance) : 0m;

    private static decimal GetLastBalance(AccountTimeline timeline, DateOnly date)
    {
        return timeline.Points
            .Where(p => p.Date <= date)
            .OrderByDescending(p => p.Date)
            .FirstOrDefault()?.Balance ?? 0m;
    }

    private static List<(int Year, int Month)> GetMonthsInRange(DateOnly start, DateOnly end)
    {
        var months = new List<(int, int)>();
        var year = start.Year;
        var month = start.Month;

        while (year < end.Year || (year == end.Year && month <= end.Month))
        {
            months.Add((year, month));
            month++;
            if (month > 12) { month = 1; year++; }
        }

        return months;
    }
}
