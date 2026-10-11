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
    /// Dev-секреты, когда-либо закоммиченные в appsettings.json проектов cashpulse / bonds / credit_calc.
    /// Любой из них (а также любое значение, содержащее "dev-secret") в проде запрещён.
    /// </summary>
    public static readonly string[] KnownDevSecrets =
    [
        "dev-secret-change-in-production-min-32-chars!!",
        "dev-secret-change-me-min-32-characters!!",
        "dev-only-secret-key-do-not-use-in-prod-32chars",
    ];

    public static bool IsKnownDevSecret(string secret) =>
        KnownDevSecrets.Contains(secret, StringComparer.Ordinal)
        || secret.Contains("dev-secret", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Бросает <see cref="InvalidOperationException"/>, если окружение не Development/Testing
    /// и секрет пустой, короче 32 символов или совпадает с одним из известных dev-значений.
    /// </summary>
    public static void EnsureValid(string? secret, bool isDevelopmentOrTesting)
    {
        if (isDevelopmentOrTesting)
            return;

        if (string.IsNullOrWhiteSpace(secret) || secret.Length < MinLength || IsKnownDevSecret(secret))
            throw new InvalidOperationException(
                "Jwt:Secret must be configured with a non-default value of at least 32 characters outside Development/Testing (set Jwt__Secret).");
    }
}
