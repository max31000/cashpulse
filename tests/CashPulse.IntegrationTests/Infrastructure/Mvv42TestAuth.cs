using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace CashPulse.IntegrationTests.Infrastructure;

/// <summary>
/// Mints mvv42-auth access tokens for tests: ES256 with a per-run test key, the production issuer/audience and
/// claims (<c>sub</c>, <c>tg</c>, <c>name</c>, <c>adm</c>, <c>apps</c>). The factory swaps the SDK's JWKS manager
/// for a static configuration holding <see cref="Key"/>, so no auth service is needed.
/// </summary>
public static class Mvv42TestAuth
{
    public const string Issuer = "https://mvv42.ru/auth";
    public const string Audience = "mvv42";
    public const string CookieName = "__Host-mvv42_at"; // SDK default (production)
    public const string Origin = "https://mvv42.ru";    // SDK default AllowedOrigins

    public static readonly ECDsaSecurityKey Key = new(ECDsa.Create(ECCurve.NamedCurves.nistP256)) { KeyId = "cashpulse-test" };

    /// <summary>Signing keys as JwtBearer would get them from JWKS.</summary>
    public static OpenIdConnectConfiguration Configuration()
    {
        var config = new OpenIdConnectConfiguration { Issuer = Issuer };
        config.SigningKeys.Add(Key);
        return config;
    }

    /// <summary>
    /// Test users carry a Telegram id derived from their local id, so a token for local user N is a token for
    /// Telegram id <c>TelegramIdFor(N)</c>; <c>sub</c> (the auth user id) is deliberately different.
    /// </summary>
    public static long TelegramIdFor(ulong localUserId) => 7_000_000_000L + (long)localUserId;

    public static string AuthSubFor(ulong localUserId) => (900_000 + localUserId).ToString();

    public static string CreateToken(
        long telegramId,
        string sub,
        string name = "Test User",
        IEnumerable<string>? apps = null,
        bool adm = false,
        TimeSpan? lifetime = null)
    {
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = now + (lifetime ?? TimeSpan.FromMinutes(10)),
            Claims = new Dictionary<string, object>
            {
                ["sub"] = sub,
                ["tg"] = telegramId.ToString(),
                ["name"] = name,
                ["adm"] = adm ? "true" : "false",
                ["apps"] = (apps ?? ["cashpulse"]).ToArray(),
            },
            SigningCredentials = new SigningCredentials(Key, SecurityAlgorithms.EcdsaSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    /// <summary>Cookie + Origin as the browser sends them (the SDK's Origin check covers unsafe methods).</summary>
    public static void Authenticate(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", $"{CookieName}={token}");
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", Origin);
    }
}
