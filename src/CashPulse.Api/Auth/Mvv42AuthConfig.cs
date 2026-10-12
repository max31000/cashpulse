using Mvv42.Auth.Client;

namespace CashPulse.Api.Auth;

/// <summary>Binds the <c>Mvv42Auth</c> configuration section onto the SDK options.</summary>
public static class Mvv42AuthConfig
{
    /// <summary>
    /// Like <c>section.Bind(options)</c>, except that a configured <c>AllowedOrigins</c> list REPLACES the SDK default
    /// (<c>https://mvv42.ru</c>) instead of being appended to it — the configuration binder appends to non-empty lists.
    /// Without the key the default stays.
    /// </summary>
    public static void Bind(IConfiguration configuration, Mvv42AuthOptions options)
    {
        var section = configuration.GetSection("Mvv42Auth");
        section.Bind(options);
        var origins = section.GetSection("AllowedOrigins").Get<List<string>>();
        if (origins is { Count: > 0 })
            options.AllowedOrigins = origins;
    }
}
