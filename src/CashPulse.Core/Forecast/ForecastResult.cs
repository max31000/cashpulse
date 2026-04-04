namespace CashPulse.Core.Forecast;

public record ForecastResult
{
    /// <summary>Timelines for each (AccountId, Currency) pair</summary>
    public required List<AccountTimeline> AccountTimelines { get; init; }

    /// <summary>Net Worth timeline in BaseCurrency</summary>
    public required List<NetWorthPoint> NetWorthTimeline { get; init; }

    /// <summary>Monthly summary breakdown</summary>
    public required List<MonthlyBreakdown> MonthlyBreakdowns { get; init; }

    /// <summary>All forecast alerts</summary>
    public required List<ForecastAlert> Alerts { get; init; }

    /// <summary>Tag aggregation summaries</summary>
    public required List<TagSummary> TagSummaries { get; init; }

    /// <summary>Calculation timestamp (UTC)</summary>
    public required DateTime CalculatedAt { get; init; }
}
