using CashPulse.Api.Auth;
using Microsoft.Extensions.Configuration;
using Mvv42.Auth.Client;
using Xunit;

namespace CashPulse.Tests.Auth;

public class Mvv42AuthConfigTests
{
    private static Mvv42AuthOptions Bind(Dictionary<string, string?> values)
    {
        var options = new Mvv42AuthOptions();
        Mvv42AuthConfig.Bind(new ConfigurationBuilder().AddInMemoryCollection(values).Build(), options);
        return options;
    }

    [Fact]
    public void ConfiguredAllowedOrigins_ReplaceTheProductionDefault()
    {
        var o = Bind(new()
        {
            ["Mvv42Auth:AllowedOrigins:0"] = "http://localhost:5173",
            ["Mvv42Auth:CookieName"] = "mvv42_at",
        });
        Assert.Equal(["http://localhost:5173"], o.AllowedOrigins);
        Assert.Equal("mvv42_at", o.CookieName);
    }

    [Fact]
    public void WithoutConfiguration_SdkDefaultsStay()
    {
        var o = Bind(new());
        Assert.Equal(["https://mvv42.ru"], o.AllowedOrigins);
        Assert.Equal("__Host-mvv42_at", o.CookieName);
        Assert.Equal("http://mvv42-auth:8080/auth/.well-known/jwks.json", o.JwksUrl);
    }
}
