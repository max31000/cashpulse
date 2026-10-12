using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using MySqlConnector;

namespace CashPulse.Api.Auth;

/// <summary>
/// The single place that creates local users. A mvv42 user is matched by Telegram id (the <c>tg</c> claim) only;
/// a new user gets the default category tree (formerly the private AuthEndpoints.SeedCategoriesForUser).
/// Existing rows — including the seeded <c>Id=1</c> user without a Telegram id — are never modified.
/// </summary>
public sealed class UserProvisioning(IUserRepository users, ICategoryRepository categoryRepo)
{
    // One API instance: serialises the first-request burst of a new user (the SPA fires parallel API calls).
    private static readonly SemaphoreSlim Gate = new(1, 1);

    /// <summary>Existing user with this Telegram id, or a new one with seeded categories.</summary>
    public async Task<User> GetOrCreateAsync(long telegramId, string displayName, CancellationToken ct = default)
    {
        if (await users.GetByTelegramIdAsync(telegramId) is { } existing)
            return existing;

        await Gate.WaitAsync(ct);
        try
        {
            if (await users.GetByTelegramIdAsync(telegramId) is { } created)
                return created;

            var user = new User
            {
                TelegramId = telegramId,
                DisplayName = string.IsNullOrWhiteSpace(displayName) ? $"user_{telegramId}" : displayName.Trim(),
                Email = null,
                BaseCurrency = "RUB",
            };
            try
            {
                user.Id = await users.CreateAsync(user);
            }
            catch (MySqlException ex) when (ex.ErrorCode == MySqlErrorCode.DuplicateKeyEntry)
            {
                // Unique TelegramId: another instance created the row a moment ago (and seeded its categories).
                return await users.GetByTelegramIdAsync(telegramId)
                       ?? throw new InvalidOperationException($"Users.TelegramId={telegramId}: duplicate key but no row", ex);
            }

            await SeedCategoriesAsync(user.Id);
            return user;
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <summary>Default category tree of a new user (moved verbatim from AuthEndpoints.SeedCategoriesForUser).</summary>
    internal async Task SeedCategoriesAsync(ulong userId)
    {
        // Корневые категории
        var incomeId  = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Доходы",  IsSystem = true, SortOrder = 0 });
        var expenseId = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Расходы", IsSystem = true, SortOrder = 1 });

        // Доходы
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "ЗП",                   ParentId = incomeId,  IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Инвестиции (доход)",    ParentId = incomeId,  IsSystem = true, SortOrder = 1 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Прочие доходы",         ParentId = incomeId,  IsSystem = true, SortOrder = 2 });

        // Расходы
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Ипотека",              ParentId = expenseId, IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Кредитка (погашение)",  ParentId = expenseId, IsSystem = true, SortOrder = 1 });
        var bytId = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Быт",       ParentId = expenseId, IsSystem = true, SortOrder = 2 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Продукты",              ParentId = bytId,     IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Рестораны/Кафе",        ParentId = bytId,     IsSystem = true, SortOrder = 1 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Подписки",              ParentId = bytId,     IsSystem = true, SortOrder = 2 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Транспорт",             ParentId = expenseId, IsSystem = true, SortOrder = 3 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Поездки",               ParentId = expenseId, IsSystem = true, SortOrder = 4 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Ремонт",                ParentId = expenseId, IsSystem = true, SortOrder = 5 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Здоровье/Медицина",     ParentId = expenseId, IsSystem = true, SortOrder = 6 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Образование",           ParentId = expenseId, IsSystem = true, SortOrder = 7 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Прочее",                ParentId = expenseId, IsSystem = true, SortOrder = 8 });
    }
}
