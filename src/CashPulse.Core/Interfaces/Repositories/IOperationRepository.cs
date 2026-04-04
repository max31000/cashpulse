using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IOperationRepository
{
    Task<IEnumerable<PlannedOperation>> GetByUserIdAsync(ulong userId, OperationFilter filter);
    Task<PlannedOperation?> GetByIdAsync(ulong id, ulong userId);
    Task<ulong> CreateAsync(PlannedOperation operation);
    Task<ulong> CreateRecurrenceRuleAsync(RecurrenceRule rule);
    Task UpdateAsync(PlannedOperation operation);
    Task DeleteAsync(ulong id, ulong userId);
    Task ConfirmAsync(ulong id, ulong userId);
    Task<IEnumerable<PlannedOperation>> GetRecurringAsync(ulong userId);
    Task<IEnumerable<PlannedOperation>> GetAllForForecastAsync(ulong userId);
}

public class OperationFilter
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public ulong? AccountId { get; set; }
    public ulong? CategoryId { get; set; }
    public string? Tag { get; set; }
    public bool? IsConfirmed { get; set; }
    public ulong? ScenarioId { get; set; }
    public int Offset { get; set; } = 0;
    public int Limit { get; set; } = 50;
}
