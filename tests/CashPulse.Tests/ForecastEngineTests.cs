using CashPulse.Core.Forecast;
using CashPulse.Core.Models;
using Xunit;

namespace CashPulse.Tests;

public class ForecastEngineTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.Today);

    // ─── helpers ────────────────────────────────────────────────────────────

    private static ForecastRequest EmptyRequest(DateOnly start, DateOnly end) => new()
    {
        CurrentBalances = new(),
        PlannedOperations = new(),
        RecurrenceRules = new(),
        Accounts = new(),
        Scenarios = new(),
        ExchangeRates = new() { ["RUB_RUB"] = 1m },
        BaseCurrency = "RUB",
        HorizonStart = start,
        HorizonEnd = end
    };

    private static Account DebitAccount(long id, string name = "Основной") => new()
    {
        Id = (ulong)id,
        Name = name,
        Type = AccountType.Debit
    };

    private static PlannedOperation RecurringOp(
        ulong id, ulong accountId, decimal amount, string currency,
        ulong ruleId, ulong? scenarioId = null) => new()
    {
        Id = id,
        AccountId = accountId,
        Amount = amount,
        Currency = currency,
        RecurrenceRuleId = ruleId,
        ScenarioId = scenarioId
    };

    private static PlannedOperation OneTimeOp(
        ulong id, ulong accountId, decimal amount, string currency,
        DateOnly date, ulong? scenarioId = null) => new()
    {
        Id = id,
        AccountId = accountId,
        Amount = amount,
        Currency = currency,
        OperationDate = date,
        ScenarioId = scenarioId
    };

    private static RecurrenceRule MonthlyRule(ulong id, int dayOfMonth, DateOnly? endDate = null) => new()
    {
        Id = id,
        Type = RecurrenceType.Monthly,
        DayOfMonth = dayOfMonth,
        StartDate = new DateOnly(2020, 1, 1),
        EndDate = endDate
    };

    // ─── TC1: Простой рост баланса ──────────────────────────────────────────

    [Fact]
    public void TC1_SimpleBalanceGrowth_6Months()
    {
        // Use fixed dates to avoid flakiness with 'today'
        var start = new DateOnly(2026, 1, 1);
        var end = new DateOnly(2026, 7, 1);

        var salaryRule = MonthlyRule(1, 15);
        var mortgageRule = MonthlyRule(2, 5); // 5th of each month — safely after Jan 1

        var request = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 100_000m }
            },
            PlannedOperations = new()
            {
                RecurringOp(1, 1, 150_000m, "RUB", 1),   // salary
                RecurringOp(2, 1, -40_000m, "RUB", 2)    // mortgage
            },
            RecurrenceRules = new()
            {
                [1L] = salaryRule,
                [2L] = mortgageRule
            },
            Accounts = new()
            {
                [1L] = DebitAccount(1)
            },
            Scenarios = new(),
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        // Balance after 6 months: 100k + 6*(150k - 40k) = 100k + 6*110k = 760k (±5k date tolerance)
        var finalNetWorth = result.NetWorthTimeline
            .OrderByDescending(p => p.Date)
            .First();
        Assert.True(finalNetWorth.Amount >= 755_000m && finalNetWorth.Amount <= 765_000m,
            $"Expected ~760k RUB net worth, got {finalNetWorth.Amount}");

        // First month must have income > 0 and expense < 0
        var firstMonth = result.MonthlyBreakdowns.First();
        Assert.True(firstMonth.Income > 0, $"Expected income > 0 in first month, got {firstMonth.Income}");
        Assert.True(firstMonth.Expense < 0, $"Expected expense < 0 in first month, got {firstMonth.Expense}");

        // No BALANCE_BELOW_ZERO alerts
        var belowZeroAlerts = result.Alerts
            .Where(a => a.Type == ForecastAlertType.BalanceBelowZero)
            .ToList();
        Assert.Empty(belowZeroAlerts);
    }

    // ─── TC2: Кредитная карта — алерт грейс-периода ─────────────────────────

    [Fact]
    public void TC2_CreditCard_GraceExpiryAlert()
    {
        // Due date must be within 7 days from HorizonStart to trigger the alert.
        // StatementDay=3, GracePeriodDays=5:
        //   For February 2026: statementDate=2026-02-03, dueDate=2026-02-08
        //   HorizonStart=2026-02-03 → daysUntilDue = (2026-02-08 - 2026-02-03).Days = 5 ≤ 7 → Warning
        //   balanceAtStatement: initial point is on 2026-02-03 (= statementDate), balance = -50k ✓

        var horizonStart = new DateOnly(2026, 2, 3);
        var horizonEnd = horizonStart.AddMonths(6);

        var creditAccount = new Account
        {
            Id = 10,
            Name = "Кредитка",
            Type = AccountType.Credit,
            CreditLimit = 100_000m,
            GracePeriodDays = 5,
            StatementDay = 3,
            DueDay = 8,
            MinPaymentPercent = 5m
        };

        var request = new ForecastRequest
        {
            // Balance = -50k means 50k used
            CurrentBalances = new()
            {
                [10L] = new() { ["RUB"] = -50_000m }
            },
            PlannedOperations = new(),
            RecurrenceRules = new(),
            Accounts = new()
            {
                [10L] = creditAccount
            },
            Scenarios = new(),
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = horizonStart,
            HorizonEnd = horizonEnd
        };

        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        var graceAlerts = result.Alerts
            .Where(a => a.Type == ForecastAlertType.CreditGraceExpiry)
            .ToList();

        Assert.NotEmpty(graceAlerts);

        var alert = graceAlerts.First();
        Assert.True(
            alert.Severity == AlertSeverity.Warning || alert.Severity == AlertSeverity.Critical,
            $"Expected Warning or Critical severity, got {alert.Severity}");
    }

    // ─── TC3: Мультивалютность — изоляция валют ──────────────────────────────

    [Fact]
    public void TC3_MultiCurrency_Isolation()
    {
        var start = Today;
        var end = Today.AddMonths(6);

        // Use a fixed date for the expense, one day after start, to avoid same-date conflict with initial balance
        var expenseDate = start.AddDays(1);

        var request = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 200_000m },
                [2L] = new() { ["USD"] = 1_000m }
            },
            PlannedOperations = new()
            {
                // One-time 50k RUB expense on the RUB account (day after start)
                OneTimeOp(1, 1, -50_000m, "RUB", expenseDate)
            },
            RecurrenceRules = new(),
            Accounts = new()
            {
                [1L] = DebitAccount(1, "RUB счёт"),
                [2L] = DebitAccount(2, "USD счёт")
            },
            Scenarios = new(),
            ExchangeRates = new() { ["USD_RUB"] = 90m, ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        // USD timeline must end at exactly 1000 USD (no changes)
        var usdTimeline = result.AccountTimelines
            .Single(t => t.AccountId == 2L && t.Currency == "USD");
        var finalUsdBalance = usdTimeline.Points.Last().Balance;
        Assert.Equal(1_000m, finalUsdBalance);

        // After the 50k expense: Net Worth = (200k - 50k) + 1000*90 = 150k + 90k = 240k RUB
        // The last NW point (after expense date) reflects this
        var finalNw = result.NetWorthTimeline
            .OrderByDescending(p => p.Date)
            .First();
        Assert.Equal(240_000m, finalNw.Amount);
    }

    // ─── TC4: Развёртывание monthly — 6 месяцев ──────────────────────────────

    [Fact]
    public void TC4_MonthlyRecurrence_6Months_15thDay()
    {
        var start = Today;
        var end = Today.AddMonths(6);

        // Rule: DayOfMonth=15, StartDate = yesterday (so it was already active)
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 15,
            StartDate = Today.AddDays(-1)
        };

        var request = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 0m }
            },
            PlannedOperations = new()
            {
                RecurringOp(1, 1, 150_000m, "RUB", 1)
            },
            RecurrenceRules = new()
            {
                [1L] = rule
            },
            Accounts = new()
            {
                [1L] = DebitAccount(1)
            },
            Scenarios = new(),
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        // Get the RUB timeline (skip the initial point)
        var timeline = result.AccountTimelines.Single(t => t.AccountId == 1L && t.Currency == "RUB");
        var opPoints = timeline.Points.Skip(1).ToList(); // skip initial balance point

        // 6 months horizon should yield 6 or 7 occurrences (±1 depending on today)
        Assert.True(opPoints.Count >= 5 && opPoints.Count <= 7,
            $"Expected 5-7 monthly operations, got {opPoints.Count}");

        // Each point date must be the 15th of its month
        foreach (var point in opPoints)
        {
            Assert.Equal(15, point.Date.Day);
        }
    }

    // ─── TC5: Рекурренс edge case — DayOfMonth=31 ────────────────────────────

    [Fact]
    public void TC5_MonthlyDayOfMonth31_EdgeCase()
    {
        var start = new DateOnly(2026, 1, 1);
        var end = new DateOnly(2026, 4, 1);

        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 31,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var request = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 0m }
            },
            PlannedOperations = new()
            {
                RecurringOp(1, 1, -1_000m, "RUB", 1)
            },
            RecurrenceRules = new()
            {
                [1L] = rule
            },
            Accounts = new()
            {
                [1L] = DebitAccount(1)
            },
            Scenarios = new(),
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        // Must not throw
        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        var timeline = result.AccountTimelines.Single(t => t.AccountId == 1L && t.Currency == "RUB");
        var opPoints = timeline.Points.Skip(1).ToList();

        // Expect 3 dates: 31 Jan, 28 Feb, 31 March
        Assert.Equal(3, opPoints.Count);
        Assert.Equal(new DateOnly(2026, 1, 31), opPoints[0].Date);
        Assert.Equal(new DateOnly(2026, 2, 28), opPoints[1].Date);
        Assert.Equal(new DateOnly(2026, 3, 31), opPoints[2].Date);
    }

    // ─── TC6: Сценарий влияет на прогноз ─────────────────────────────────────

    [Fact]
    public void TC6_Scenario_AffectsForecast()
    {
        var start = new DateOnly(2026, 1, 1);
        var end = new DateOnly(2026, 7, 1);
        var carPurchaseDate = new DateOnly(2026, 3, 1);

        var scenario = new Scenario
        {
            Id = 1,
            Name = "Машина",
            IsActive = true
        };

        // Base income rule
        var salaryRule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 15,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var request_withScenario = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 0m }
            },
            PlannedOperations = new()
            {
                RecurringOp(1, 1, 150_000m, "RUB", 1),                          // base income, no scenario
                OneTimeOp(2, 1, -2_500_000m, "RUB", carPurchaseDate, scenarioId: 1) // car purchase, scenario 1
            },
            RecurrenceRules = new()
            {
                [1L] = salaryRule
            },
            Accounts = new()
            {
                [1L] = DebitAccount(1)
            },
            Scenarios = new()
            {
                [1L] = scenario  // IsActive = true
            },
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        // Inactive scenario version
        var inactiveScenario = new Scenario { Id = 1, Name = "Машина", IsActive = false };
        var request_withoutScenario = request_withScenario with
        {
            Scenarios = new() { [1L] = inactiveScenario }
        };

        var engine = new ForecastEngine();

        var resultWith = engine.Calculate(request_withScenario);
        var resultWithout = engine.Calculate(request_withoutScenario);

        // With scenario: the -2.5M car purchase is in the timeline
        var timelineWith = resultWith.AccountTimelines.Single(t => t.AccountId == 1L && t.Currency == "RUB");
        var hasCarPurchaseWith = timelineWith.Points.Any(p => p.Balance < -2_000_000m || p.Date == carPurchaseDate && timelineWith.Points.Any(pp => pp.Date == carPurchaseDate));
        // Check that the car expense point exists (any point with a -2.5M drop)
        var carPointWith = timelineWith.Points.FirstOrDefault(p => p.Date == carPurchaseDate && p.OperationId == 2);
        Assert.NotNull(carPointWith);

        // Without scenario: the -2.5M car purchase is NOT in the timeline
        var timelineWithout = resultWithout.AccountTimelines.Single(t => t.AccountId == 1L && t.Currency == "RUB");
        var carPointWithout = timelineWithout.Points.FirstOrDefault(p => p.Date == carPurchaseDate && p.OperationId == 2);
        Assert.Null(carPointWithout);

        // With scenario: points linked to ScenarioId=1 must have IsScenario=true
        Assert.True(carPointWith!.IsScenario);
    }

    // ─── TC7: Алерт BALANCE_BELOW_ZERO ───────────────────────────────────────

    [Fact]
    public void TC7_BalanceBelowZero_Alert()
    {
        var start = new DateOnly(2026, 1, 1);
        var end = new DateOnly(2027, 1, 1);

        // Expense 100k + 50k = 150k/month, no income → depletes 300k in ~2 months
        var expense1Rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 5,
            StartDate = new DateOnly(2026, 1, 1)
        };
        var expense2Rule = new RecurrenceRule
        {
            Id = 2,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 20,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var request = new ForecastRequest
        {
            CurrentBalances = new()
            {
                [1L] = new() { ["RUB"] = 300_000m }
            },
            PlannedOperations = new()
            {
                RecurringOp(1, 1, -100_000m, "RUB", 1),
                RecurringOp(2, 1, -50_000m, "RUB", 2)
            },
            RecurrenceRules = new()
            {
                [1L] = expense1Rule,
                [2L] = expense2Rule
            },
            Accounts = new()
            {
                [1L] = DebitAccount(1, "Основной")
            },
            Scenarios = new(),
            ExchangeRates = new() { ["RUB_RUB"] = 1m },
            BaseCurrency = "RUB",
            HorizonStart = start,
            HorizonEnd = end
        };

        var engine = new ForecastEngine();
        var result = engine.Calculate(request);

        // Alert must be present
        var belowZeroAlerts = result.Alerts
            .Where(a => a.Type == ForecastAlertType.BalanceBelowZero)
            .ToList();

        Assert.NotEmpty(belowZeroAlerts);

        // Severity = Critical
        Assert.All(belowZeroAlerts, a =>
            Assert.Equal(AlertSeverity.Critical, a.Severity));

        // The zero-crossing should happen around month 3 (after 300k / 150k per month ≈ 2 months)
        var alertDate = belowZeroAlerts.First().Date;
        Assert.True(alertDate >= new DateOnly(2026, 2, 1) && alertDate <= new DateOnly(2026, 4, 1),
            $"Expected zero-crossing in Feb-Apr 2026, got {alertDate}");
    }

    // ─── TC8: Пустой пользователь ────────────────────────────────────────────

    [Fact]
    public void TC8_EmptyUser_ReturnsValidResult()
    {
        var start = Today;
        var end = Today.AddMonths(6);

        var request = EmptyRequest(start, end);

        var engine = new ForecastEngine();

        // Must not throw
        var result = engine.Calculate(request);

        Assert.NotNull(result);
        Assert.Empty(result.AccountTimelines);

        // Net worth timeline should have at least the start date with 0
        Assert.NotEmpty(result.NetWorthTimeline);
        var startPoint = result.NetWorthTimeline.First();
        Assert.Equal(start, startPoint.Date);
        Assert.Equal(0m, startPoint.Amount);

        Assert.Empty(result.Alerts);

        // 6 or 7 months of breakdowns (start month + 6 full months depending on date)
        Assert.True(result.MonthlyBreakdowns.Count >= 6 && result.MonthlyBreakdowns.Count <= 7,
            $"Expected 6-7 monthly breakdowns, got {result.MonthlyBreakdowns.Count}");
    }
}
