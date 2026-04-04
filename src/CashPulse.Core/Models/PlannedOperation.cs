namespace CashPulse.Core.Models;

public class PlannedOperation
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public ulong AccountId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public ulong? CategoryId { get; set; }
    public List<string>? Tags { get; set; }
    public string? Description { get; set; }
    public DateOnly? OperationDate { get; set; }
    public ulong? RecurrenceRuleId { get; set; }
    public bool IsConfirmed { get; set; }
    public ulong? ScenarioId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Loaded separately
    public RecurrenceRule? RecurrenceRule { get; set; }
}
