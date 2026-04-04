using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IScenarioRepository
{
    Task<IEnumerable<Scenario>> GetByUserIdAsync(ulong userId);
    Task<Scenario?> GetByIdAsync(ulong id, ulong userId);
    Task<ulong> CreateAsync(Scenario scenario);
    Task UpdateAsync(Scenario scenario);
    Task<bool> DeleteAsync(ulong id, ulong userId);
    Task<bool> ToggleActiveAsync(ulong id, ulong userId);
    Task<IEnumerable<Scenario>> GetActiveAsync(ulong userId);
}
