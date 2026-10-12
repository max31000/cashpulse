using Microsoft.Extensions.Caching.Memory;
using Mvv42.Auth.Client;

namespace CashPulse.Api.Auth;

/// <summary>The local CashPulse user of the current request.</summary>
public interface ICurrentUser
{
    /// <summary>
    /// Local <c>Users.Id</c> of the signed-in mvv42 user, found (or created with default categories) by the
    /// Telegram id in the <c>tg</c> claim. The auth service's <c>sub</c> is never used as a local id.
    /// </summary>
    Task<ulong> GetIdAsync(CancellationToken ct = default);
}

/// <summary>
/// Request-scoped <see cref="ICurrentUser"/>: <c>tg</c> claim → local id, cached for 10 minutes per Telegram id.
/// Endpoints only run after <see cref="Mvv42Auth.Policy"/> succeeded, so a missing mvv42 user is a 401.
/// </summary>
public sealed class CurrentUser(IHttpContextAccessor accessor, UserProvisioning provisioning, IMemoryCache cache) : ICurrentUser
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);
    private ulong? _id;

    public async Task<ulong> GetIdAsync(CancellationToken ct = default)
    {
        if (_id is { } known)
            return known;

        var me = accessor.HttpContext?.User.GetMvv42User() ?? throw new UnauthenticatedException();

        var id = await cache.GetOrCreateAsync(CacheKey(me.TelegramId), async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            return (await provisioning.GetOrCreateAsync(me.TelegramId, me.Name, ct)).Id;
        });

        _id = id;
        return id;
    }

    internal static string CacheKey(long telegramId) => $"cashpulse:local-uid:{telegramId}";
}

/// <summary>No authenticated mvv42 user on a request that needs one (mapped to 401 by ErrorHandlingMiddleware).</summary>
public sealed class UnauthenticatedException() : Exception("Требуется авторизация");
