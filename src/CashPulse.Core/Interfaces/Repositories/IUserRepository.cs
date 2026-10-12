using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IUserRepository
{
    Task<User?> GetByTelegramIdAsync(long telegramId);
    Task<User?> GetByIdAsync(ulong id);
    Task<ulong> CreateAsync(User user);

    /// <summary>
    /// Inserts the user and its seed categories in ONE transaction: either a fully seeded user exists afterwards or
    /// nothing does (a duplicate TelegramId raises MySQL 1062 and rolls back). Returns the new user id.
    /// </summary>
    Task<ulong> CreateWithCategoriesAsync(User user, IReadOnlyList<CategorySeed> categories);
    Task UpdateAsync(User user);
}
