namespace CashPulse.Core.Forecast;

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
