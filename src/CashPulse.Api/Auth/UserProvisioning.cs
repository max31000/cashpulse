using System.Collections.Concurrent;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using MySqlConnector;

namespace CashPulse.Api.Auth;

/// <summary>
/// The single place that creates local users. A mvv42 user is matched by Telegram id (the <c>tg</c> claim) only;
/// a new user is inserted together with the default category tree in one transaction
/// (<see cref="IUserRepository.CreateWithCategoriesAsync"/>), so a user row never exists half-seeded.
/// Existing rows — including the seeded <c>Id=1</c> user without a Telegram id — are never modified.
/// </summary>
public sealed class UserProvisioning(IUserRepository users)
{
    /// <summary>Default categories of a new user (formerly AuthEndpoints.SeedCategoriesForUser).</summary>
    public static readonly IReadOnlyList<CategorySeed> DefaultCategories =
    [
        new("Доходы",
        [
            new("ЗП"),
            new("Инвестиции (доход)"),
            new("Прочие доходы"),
        ]),
        new("Расходы",
        [
            new("Ипотека"),
            new("Кредитка (погашение)"),
            new("Быт",
            [
                new("Продукты"),
                new("Рестораны/Кафе"),
                new("Подписки"),
            ]),
            new("Транспорт"),
            new("Поездки"),
            new("Ремонт"),
            new("Здоровье/Медицина"),
            new("Образование"),
            new("Прочее"),
        ]),
    ];

    // Per-Telegram-id gate: serialises the first-request burst of ONE new user (the SPA fires parallel calls) in
    // this process without blocking other users. Across processes the unique TelegramId + 1062 handling decides.
    // Entries are tiny and only created for users being provisioned; they are removed when the burst ends.
    private static readonly ConcurrentDictionary<long, SemaphoreSlim> Gates = new();

    /// <summary>Existing user with this Telegram id, or a new, fully seeded one.</summary>
    public async Task<User> GetOrCreateAsync(long telegramId, string displayName, CancellationToken ct = default)
    {
        if (await users.GetByTelegramIdAsync(telegramId) is { } existing)
            return existing;

        var gate = Gates.GetOrAdd(telegramId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
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
                user.Id = await users.CreateWithCategoriesAsync(user, DefaultCategories);
                return user;
            }
            catch (Exception ex) when (IsDuplicateKey(ex))
            {
                // Another process committed this Telegram id a moment ago — together with its categories (same
                // transaction), so the row we read back is complete.
                return await users.GetByTelegramIdAsync(telegramId)
                       ?? throw new InvalidOperationException($"Users.TelegramId={telegramId}: duplicate key but no row", ex);
            }
        }
        finally
        {
            gate.Release();
            if (gate.CurrentCount == 1)
                Gates.TryRemove(new KeyValuePair<long, SemaphoreSlim>(telegramId, gate));
        }
    }

    /// <summary>MySQL 1062 (unique TelegramId), possibly wrapped.</summary>
    internal static bool IsDuplicateKey(Exception ex) =>
        ex is MySqlException { ErrorCode: MySqlErrorCode.DuplicateKeyEntry }
        || (ex.InnerException is { } inner && IsDuplicateKey(inner));
}
