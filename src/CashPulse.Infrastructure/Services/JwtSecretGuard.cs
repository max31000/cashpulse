namespace CashPulse.Infrastructure.Services;

/// <summary>
/// Проверяет, что Jwt:Secret задан корректно вне Development/Testing окружений.
/// </summary>
public static class JwtSecretGuard
{
    /// <summary>Значение секрета, закоммиченное в appsettings.json (только для разработки).</summary>
    public const string DevSecret = "dev-secret-change-in-production-min-32-chars!!";

    public const int MinLength = 32;

    /// <summary>
    /// Бросает <see cref="InvalidOperationException"/>, если окружение не Development/Testing
    /// и секрет пустой, короче 32 символов или совпадает с dev-значением.
    /// </summary>
    public static void EnsureValid(string? secret, bool isDevelopmentOrTesting)
    {
        if (isDevelopmentOrTesting)
            return;

        if (string.IsNullOrWhiteSpace(secret) || secret.Length < MinLength || secret == DevSecret)
            throw new InvalidOperationException(
                "Jwt:Secret must be configured with a non-default value of at least 32 characters outside Development/Testing (set Jwt__Secret).");
    }
}
