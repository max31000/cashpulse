using CashPulse.Core.Models;

namespace CashPulse.Core.Forecast;

public static class RecurrenceExpander
{
    private const int MaxOperationsPerRule = 10000;

    public static List<ProjectedOperation> Expand(
        RecurrenceRule rule,
        PlannedOperation template,
        DateOnly horizonStart,
        DateOnly horizonEnd)
    {
        var effectiveStart = rule.StartDate > horizonStart ? rule.StartDate : horizonStart;
        var effectiveEnd = rule.EndDate.HasValue
            ? (rule.EndDate.Value < horizonEnd ? rule.EndDate.Value : horizonEnd)
            : horizonEnd;

        if (effectiveStart > effectiveEnd)
            return new List<ProjectedOperation>();

        var dates = rule.Type switch
        {
            RecurrenceType.Daily => GenerateDaily(effectiveStart, effectiveEnd),
            RecurrenceType.Weekly => GenerateWeekly(rule, effectiveStart, effectiveEnd),
            RecurrenceType.Biweekly => GenerateBiweekly(rule, effectiveStart, effectiveEnd),
            RecurrenceType.Monthly => GenerateMonthly(rule, effectiveStart, effectiveEnd),
            RecurrenceType.Quarterly => GenerateQuarterly(rule, effectiveStart, effectiveEnd),
            RecurrenceType.Yearly => GenerateYearly(rule, effectiveStart, effectiveEnd),
            RecurrenceType.Custom => GenerateCustom(rule, effectiveStart, effectiveEnd),
            _ => throw new InvalidOperationException($"Unknown recurrence type: {rule.Type}")
        };

        if (dates.Count > MaxOperationsPerRule)
            throw new RecurrenceExpansionOverflowException(
                $"Правило повторения сгенерировало более {MaxOperationsPerRule} операций. Уточните диапазон дат.");

        return dates.Select(date => new ProjectedOperation
        {
            Date = date,
            Amount = template.Amount,
            Currency = template.Currency,
            AccountId = (long)template.AccountId,
            CategoryId = template.CategoryId.HasValue ? (long)template.CategoryId.Value : null,
            Tags = template.Tags,
            Description = template.Description,
            TemplateOperationId = (long)template.Id,
            ScenarioId = template.ScenarioId.HasValue ? (long)template.ScenarioId.Value : null,
            IsRecurring = true
        }).ToList();
    }

    private static List<DateOnly> GenerateDaily(DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var current = start;
        while (current <= end)
        {
            dates.Add(current);
            current = current.AddDays(1);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateWeekly(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        if (rule.DaysOfWeek == null || rule.DaysOfWeek.Count == 0)
            return dates;

        var daysSet = new HashSet<int>(rule.DaysOfWeek);
        var current = start;
        while (current <= end)
        {
            if (daysSet.Contains((int)current.DayOfWeek))
                dates.Add(current);
            current = current.AddDays(1);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateBiweekly(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var current = rule.StartDate;

        // advance to >= start
        while (current < start)
            current = current.AddDays(14);

        while (current <= end)
        {
            dates.Add(current);
            current = current.AddDays(14);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateMonthly(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var dayOfMonth = rule.DayOfMonth ?? 1;

        var startYear = start.Year;
        var startMonth = start.Month;
        var endYear = end.Year;
        var endMonth = end.Month;

        var year = startYear;
        var month = startMonth;

        while (year < endYear || (year == endYear && month <= endMonth))
        {
            var date = ResolveMonthlyDate(year, month, dayOfMonth);
            if (date >= start && date <= end)
                dates.Add(date);

            month++;
            if (month > 12) { month = 1; year++; }
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateQuarterly(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var dayOfMonth = rule.DayOfMonth ?? 1;
        var current = rule.StartDate;

        while (current < start)
            current = current.AddMonths(3);

        while (current <= end)
        {
            var date = ResolveMonthlyDate(current.Year, current.Month, dayOfMonth);
            if (date >= start && date <= end)
                dates.Add(date);
            current = current.AddMonths(3);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateYearly(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var current = rule.StartDate;

        while (current < start)
            current = current.AddYears(1);

        while (current <= end)
        {
            var yearsAdded = current.Year - rule.StartDate.Year;
            var date = SafeAddYears(rule.StartDate, yearsAdded);
            if (date >= start && date <= end)
                dates.Add(date);
            current = current.AddYears(1);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    private static List<DateOnly> GenerateCustom(RecurrenceRule rule, DateOnly start, DateOnly end)
    {
        var dates = new List<DateOnly>();
        var interval = rule.Interval ?? 1;
        if (interval < 1) interval = 1;

        var current = rule.StartDate;
        while (current < start)
            current = current.AddDays(interval);

        while (current <= end)
        {
            dates.Add(current);
            current = current.AddDays(interval);
            if (dates.Count > MaxOperationsPerRule) break;
        }
        return dates;
    }

    public static DateOnly ResolveMonthlyDate(int year, int month, int dayOfMonth)
    {
        var daysInMonth = DateTime.DaysInMonth(year, month);
        if (dayOfMonth == -1 || dayOfMonth > daysInMonth)
            return new DateOnly(year, month, daysInMonth);
        return new DateOnly(year, month, dayOfMonth);
    }

    private static DateOnly SafeAddYears(DateOnly startDate, int years)
    {
        try
        {
            return startDate.AddYears(years);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Handle Feb 29 in non-leap years
            return new DateOnly(startDate.Year + years, 2, 28);
        }
    }
}

public class RecurrenceExpansionOverflowException : Exception
{
    public RecurrenceExpansionOverflowException(string message) : base(message) { }
}
