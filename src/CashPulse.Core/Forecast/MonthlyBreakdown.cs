namespace CashPulse.Core.Forecast;

public record MonthlyBreakdown
{
    public required int Year { get; init; }
    public required int Month { get; init; }
    public required decimal Income { get; init; }
    public required decimal Expense { get; init; }
    public required decimal EndBalance { get; init; }
    public required Dictionary<long?, decimal> ByCategory { get; init; }
}
