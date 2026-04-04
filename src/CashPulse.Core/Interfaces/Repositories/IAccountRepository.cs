using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IAccountRepository
{
    Task<IEnumerable<Account>> GetByUserIdAsync(ulong userId);
    Task<Account?> GetByIdAsync(ulong id, ulong userId);
    Task<ulong> CreateAsync(Account account);
    Task UpdateAsync(Account account);
    Task<bool> ArchiveAsync(ulong id, ulong userId);
    Task<IEnumerable<CurrencyBalance>> GetBalancesAsync(ulong accountId);
    Task UpdateBalancesAsync(ulong accountId, IEnumerable<CurrencyBalance> balances);
}
