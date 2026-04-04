namespace CashPulse.Core.Forecast;

public record TagSummary
{
    public required string Tag { get; init; }
    public required int OperationCount { get; init; }
    public required decimal TotalConfirmed { get; init; }
    public required decimal TotalPlanned { get; init; }
    public required decimal Total { get; init; }
    public required string Currency { get; init; }
}
