using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface ICategoryRepository
{
    Task<IEnumerable<Category>> GetByUserIdAsync(ulong userId);
    Task<Category?> GetByIdAsync(ulong id, ulong userId);
    Task<ulong> CreateAsync(Category category);
    Task UpdateAsync(Category category);
    Task<bool> DeleteAsync(ulong id, ulong userId);
}
