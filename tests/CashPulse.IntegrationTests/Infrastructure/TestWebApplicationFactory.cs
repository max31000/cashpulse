using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace CashPulse.IntegrationTests.Infrastructure;

/// <summary>
/// WebApplicationFactory that wires in a Testcontainers MySQL database
/// and overrides JWT config to match JwtTestHelper.
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
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Override connection string to point at the test container
                ["ConnectionStrings:DefaultConnection"] = _dbFixture.ConnectionString,

                // Override JWT config to match JwtTestHelper tokens
                ["Jwt:Secret"]   = JwtTestHelper.TestSecret,
                ["Jwt:Issuer"]   = JwtTestHelper.TestIssuer,
                ["Jwt:Audience"] = JwtTestHelper.TestAudience,

                // Disable CBR exchange rate fetch during tests
                ["ExchangeRates:CbrXmlUrl"] = "http://localhost:9999/does-not-exist",
                ["ExchangeRates:RefreshIntervalHours"] = "99999",
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
        });
    }

    /// <summary>
    /// Creates an HttpClient with a valid JWT bearer token for the given userId.
    /// UserId defaults to 1 (the seeded test user).
    /// </summary>
    public HttpClient CreateAuthenticatedClient(ulong userId = 1)
    {
        var client = CreateClient();
        var token = JwtTestHelper.GenerateToken(userId);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
