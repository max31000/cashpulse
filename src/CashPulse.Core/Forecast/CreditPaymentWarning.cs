namespace CashPulse.Core.Forecast;

public record CreditPaymentWarning
{
    public required long AccountId { get; init; }
    public required DateOnly DueDate { get; init; }
    public required decimal MinPayment { get; init; }
    public required decimal CreditUsed { get; init; }
    public required string Currency { get; init; }
}
