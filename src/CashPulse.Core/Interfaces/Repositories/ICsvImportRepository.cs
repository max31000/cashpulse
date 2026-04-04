using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface ICsvImportRepository
{
    Task<IEnumerable<CsvImportSession>> GetByUserIdAsync(ulong userId);
    Task<ulong> CreateSessionAsync(CsvImportSession session);
}
