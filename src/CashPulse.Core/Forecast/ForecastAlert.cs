namespace CashPulse.Core.Forecast;

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

public enum AlertSeverity
{
    Info,
    Warning,
    Critical
}
