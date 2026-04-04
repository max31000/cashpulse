using CashPulse.Core.Forecast;
using CashPulse.Core.Models;
using Xunit;

namespace CashPulse.Tests;

public class RecurrenceExpanderTests
{
    // ─── helpers ────────────────────────────────────────────────────────────

    private static PlannedOperation MakeTemplate(ulong id = 1, ulong accountId = 1, decimal amount = -1000m) => new()
    {
        Id = id,
        AccountId = accountId,
        Amount = amount,
        Currency = "RUB"
    };

    private static List<DateOnly> ExpandDates(RecurrenceRule rule, DateOnly horizonStart, DateOnly horizonEnd)
    {
        var template = MakeTemplate();
        var ops = RecurrenceExpander.Expand(rule, template, horizonStart, horizonEnd);
        return ops.Select(o => o.Date).OrderBy(d => d).ToList();
    }

    // ─── TC_R1: Daily ────────────────────────────────────────────────────────

    [Fact]
    public void TCR1_Daily_5Days_ReturnsCorrectDates()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Daily,
            StartDate = new DateOnly(2026, 1, 1),
            EndDate = new DateOnly(2026, 1, 5)
        };

        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 10));

        Assert.Equal(5, dates.Count);
        Assert.Equal(new DateOnly(2026, 1, 1), dates[0]);
        Assert.Equal(new DateOnly(2026, 1, 2), dates[1]);
        Assert.Equal(new DateOnly(2026, 1, 3), dates[2]);
        Assert.Equal(new DateOnly(2026, 1, 4), dates[3]);
        Assert.Equal(new DateOnly(2026, 1, 5), dates[4]);
    }

    // ─── TC_R2: Weekly по пн и пт ────────────────────────────────────────────

    [Fact]
    public void TCR2_Weekly_MondayAndFriday()
    {
        // 2026-01-05 is Monday, 2026-01-09 is Friday
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Weekly,
            DaysOfWeek = new List<int> { 1, 5 }, // Monday=1, Friday=5
            StartDate = new DateOnly(2026, 1, 5)
        };

        var horizonStart = new DateOnly(2026, 1, 5);
        var horizonEnd = new DateOnly(2026, 1, 11); // 1 week

        var dates = ExpandDates(rule, horizonStart, horizonEnd);

        Assert.Contains(new DateOnly(2026, 1, 5), dates);  // Monday
        Assert.Contains(new DateOnly(2026, 1, 9), dates);  // Friday
    }

    // ─── TC_R3: Biweekly ─────────────────────────────────────────────────────

    [Fact]
    public void TCR3_Biweekly_2Months()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Biweekly,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 2, 28));

        // Expected: 1 Jan, 15 Jan, 29 Jan, 12 Feb, 26 Feb
        Assert.Contains(new DateOnly(2026, 1, 1), dates);
        Assert.Contains(new DateOnly(2026, 1, 15), dates);
        Assert.Contains(new DateOnly(2026, 1, 29), dates);
        Assert.Contains(new DateOnly(2026, 2, 12), dates);
        Assert.Contains(new DateOnly(2026, 2, 26), dates);
        Assert.Equal(5, dates.Count);
    }

    // ─── TC_R4: Monthly DayOfMonth=31 — edge case ────────────────────────────

    [Fact]
    public void TCR4_Monthly_DayOfMonth31_ClampsToDaysInMonth()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 31,
            StartDate = new DateOnly(2026, 1, 1)
        };

        // No exception expected
        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 4, 1));

        Assert.Equal(3, dates.Count);
        Assert.Equal(new DateOnly(2026, 1, 31), dates[0]); // January has 31 days
        Assert.Equal(new DateOnly(2026, 2, 28), dates[1]); // February has 28 days
        Assert.Equal(new DateOnly(2026, 3, 31), dates[2]); // March has 31 days
    }

    // ─── TC_R5: Monthly DayOfMonth=-1 (последний день) ───────────────────────

    [Fact]
    public void TCR5_Monthly_DayOfMonthMinus1_LastDayOfMonth()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = -1,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 4, 1));

        Assert.Equal(3, dates.Count);
        Assert.Equal(new DateOnly(2026, 1, 31), dates[0]);
        Assert.Equal(new DateOnly(2026, 2, 28), dates[1]);
        Assert.Equal(new DateOnly(2026, 3, 31), dates[2]);
    }

    // ─── TC_R6: Quarterly ────────────────────────────────────────────────────

    [Fact]
    public void TCR6_Quarterly_4TimesIn12Months()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Quarterly,
            DayOfMonth = 15,
            StartDate = new DateOnly(2026, 1, 15)
        };

        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31));

        Assert.Equal(4, dates.Count);
        Assert.Contains(new DateOnly(2026, 1, 15), dates);
        Assert.Contains(new DateOnly(2026, 4, 15), dates);
        Assert.Contains(new DateOnly(2026, 7, 15), dates);
        Assert.Contains(new DateOnly(2026, 10, 15), dates);
    }

    // ─── TC_R7: Custom interval ──────────────────────────────────────────────

    [Fact]
    public void TCR7_Custom_Every10Days()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Custom,
            Interval = 10,
            StartDate = new DateOnly(2026, 1, 1)
        };

        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 31));

        Assert.Equal(4, dates.Count);
        Assert.Equal(new DateOnly(2026, 1, 1), dates[0]);
        Assert.Equal(new DateOnly(2026, 1, 11), dates[1]);
        Assert.Equal(new DateOnly(2026, 1, 21), dates[2]);
        Assert.Equal(new DateOnly(2026, 1, 31), dates[3]);
    }

    // ─── TC_R8: EndDate отсекает даты ────────────────────────────────────────

    [Fact]
    public void TCR8_EndDate_CutsDatesAfterEndDate()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 1,
            StartDate = new DateOnly(2026, 1, 1),
            EndDate = new DateOnly(2026, 3, 1)  // only through March 1
        };

        // Horizon is 12 months but EndDate limits to 3 dates
        var dates = ExpandDates(rule, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31));

        Assert.Equal(3, dates.Count);
        Assert.Equal(new DateOnly(2026, 1, 1), dates[0]);
        Assert.Equal(new DateOnly(2026, 2, 1), dates[1]);
        Assert.Equal(new DateOnly(2026, 3, 1), dates[2]);
    }

    // ─── TC_R9: HorizonStart отсекает прошлые даты ───────────────────────────

    [Fact]
    public void TCR9_HorizonStart_CutsDatesBefore()
    {
        var rule = new RecurrenceRule
        {
            Id = 1,
            Type = RecurrenceType.Monthly,
            DayOfMonth = 1,
            StartDate = new DateOnly(2025, 1, 1)  // rule started in the past
        };

        // Horizon starts from March 2026
        var horizonStart = new DateOnly(2026, 3, 1);
        var horizonEnd = new DateOnly(2026, 12, 31);

        var dates = ExpandDates(rule, horizonStart, horizonEnd);

        // Should only contain dates from March through December 2026
        Assert.All(dates, d => Assert.True(d >= horizonStart, $"Date {d} is before horizon start"));
        Assert.All(dates, d => Assert.True(d <= horizonEnd, $"Date {d} is after horizon end"));

        // 10 months: March, April, May, June, July, Aug, Sep, Oct, Nov, Dec
        Assert.Equal(10, dates.Count);
        Assert.Equal(new DateOnly(2026, 3, 1), dates[0]);
        Assert.Equal(new DateOnly(2026, 12, 1), dates[9]);
    }

    // ─── Additional: ResolveMonthlyDate is public and correct ────────────────

    [Theory]
    [InlineData(2026, 2, 31, 28)]   // Feb: 31 → 28
    [InlineData(2026, 2, 29, 28)]   // Feb: 29 → 28
    [InlineData(2026, 2, -1, 28)]   // Feb: -1 → last = 28
    [InlineData(2026, 1, 31, 31)]   // Jan: 31 → 31 (normal)
    [InlineData(2026, 3, 31, 31)]   // Mar: 31 → 31 (normal)
    [InlineData(2024, 2, -1, 29)]   // Feb 2024 (leap): -1 → 29
    public void ResolveMonthlyDate_Clamping(int year, int month, int dayOfMonth, int expectedDay)
    {
        var result = RecurrenceExpander.ResolveMonthlyDate(year, month, dayOfMonth);
        Assert.Equal(year, result.Year);
        Assert.Equal(month, result.Month);
        Assert.Equal(expectedDay, result.Day);
    }
}
