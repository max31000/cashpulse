using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IIncomeSourceRepository
{
    Task<IEnumerable<IncomeSource>> GetAllAsync(ulong userId);
    Task<IncomeSource?> GetByIdAsync(ulong id, ulong userId);
    Task<ulong> CreateAsync(IncomeSource source, IEnumerable<IncomeTranche> tranches);
    Task UpdateAsync(IncomeSource source, IEnumerable<IncomeTranche> tranches);
    Task<bool> DeactivateAsync(ulong id, ulong userId);
    Task<bool> DeleteAsync(ulong id, ulong userId);
}
