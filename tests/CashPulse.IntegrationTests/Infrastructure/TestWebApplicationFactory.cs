using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Mvv42.Auth.Client;
using Xunit;

namespace CashPulse.IntegrationTests.Infrastructure;

/// <summary>
/// WebApplicationFactory that wires in a Testcontainers MySQL database and makes the mvv42 scheme trust the
/// test signing key of <see cref="Mvv42TestAuth"/> (static configuration instead of the JWKS endpoint).
/// </summary>
public class TestWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly DatabaseFixture _dbFixture = new();

    public DatabaseFixture Database => _dbFixture;

    public async Task InitializeAsync()
    {
        await _dbFixture.InitializeAsync();
    }

    public new async Task DisposeAsync()
    {
        await _dbFixture.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Mark environment as Testing so Program.cs skips MigrationRunner
        // (migrations are already applied by DatabaseFixture via TestContainers)
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Override connection string to point at the test container
                ["ConnectionStrings:DefaultConnection"] = _dbFixture.ConnectionString,

                // Disable CBR exchange rate fetch during tests
                ["ExchangeRates:CbrXmlUrl"] = "http://localhost:9999/does-not-exist",
                ["ExchangeRates:RefreshIntervalHours"] = "99999",

                // No separate Prometheus metric server (port 9091) in tests
                ["Metrics:Port"] = "0",
            });
        });

        builder.ConfigureServices(services =>
        {
            // Remove all background services to avoid side effects in tests
            // (especially ExchangeRateRefreshService which tries to call CBR API)
            var hostedServiceDescriptors = services
                .Where(d => d.ServiceType == typeof(IHostedService))
                .ToList();

            foreach (var descriptor in hostedServiceDescriptors)
                services.Remove(descriptor);

            // Keys of the test "auth service" instead of http://mvv42-auth:8080/auth/.well-known/jwks.json
            services.PostConfigure<JwtBearerOptions>(Mvv42Auth.Scheme, o =>
                o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(Mvv42TestAuth.Configuration()));
        });
    }

    /// <summary>
    /// HttpClient signed in as the local user <paramref name="userId"/> (default 1, the seeded test user): an mvv42
    /// access cookie whose <c>tg</c> is that user's Telegram id and whose <c>sub</c> is a different number.
    /// Make sure the user row exists with that Telegram id (<see cref="DatabaseFixture.EnsureUserAsync"/>), otherwise
    /// the API provisions a new user for it.
    /// </summary>
    public HttpClient CreateAuthenticatedClient(ulong userId = 1)
    {
        var token = Mvv42TestAuth.CreateToken(
            Mvv42TestAuth.TelegramIdFor(userId), Mvv42TestAuth.AuthSubFor(userId), $"User {userId}");
        return CreateClientWithToken(token);
    }

    public HttpClient CreateClientWithToken(string token)
    {
        var client = CreateClient();
        Mvv42TestAuth.Authenticate(client, token);
        return client;
    }
}
