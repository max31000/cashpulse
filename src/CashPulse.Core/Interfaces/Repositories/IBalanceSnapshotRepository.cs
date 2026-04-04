using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IBalanceSnapshotRepository
{
    Task<IEnumerable<BalanceSnapshot>> GetByAccountIdAsync(ulong accountId);
    Task<ulong> CreateAsync(BalanceSnapshot snapshot);
    Task<BalanceSnapshot?> GetLatestAsync(ulong accountId, string currency);
}
