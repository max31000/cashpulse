namespace CashPulse.Core.Forecast;

public record NetWorthPoint
{
    public required DateOnly Date { get; init; }
    public required decimal Amount { get; init; }
    public required string Currency { get; init; }
}
