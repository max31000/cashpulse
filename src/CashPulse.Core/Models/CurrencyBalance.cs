namespace CashPulse.Core.Models;

public class CurrencyBalance
{
    public ulong AccountId { get; set; }
    public string Currency { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}
