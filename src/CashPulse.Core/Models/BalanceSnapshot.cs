namespace CashPulse.Core.Models;

public class BalanceSnapshot
{
    public ulong Id { get; set; }
    public ulong AccountId { get; set; }
    public string Currency { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateOnly SnapshotDate { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
}
