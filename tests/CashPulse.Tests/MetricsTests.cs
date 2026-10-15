using System.Net;
using CashPulse.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Mvv42.Auth.Client;
using Prometheus;
using Xunit;

namespace CashPulse.Tests;

/// <summary>
/// Prometheus metrics contract: the main app port never serves <c>/metrics</c> (a separate KestrelMetricServer
/// does, disabled here via <c>Metrics:Port = 0</c>), and HTTP metrics are labelled with the route template,
/// never the concrete path. Boots the real API without a database (unauthenticated requests stop at 401).
/// </summary>
public class MetricsTests : IClassFixture<MetricsTests.NoDbFactory>
{
    public sealed class NoDbFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing"); // skips migrations
            builder.UseSetting("Metrics:Port", "0");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Server=127.0.0.1;Port=1;Database=none;User=none;Password=none;",
                ["Metrics:Port"] = "0",
            }));
            builder.ConfigureServices(services =>
            {
                foreach (var d in services.Where(d => d.ServiceType == typeof(IHostedService)).ToList())
                    services.Remove(d);
                services.PostConfigure<JwtBearerOptions>(Mvv42Auth.Scheme, o =>
                    o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(Mvv42TestAuth.Configuration()));
            });
        }
    }

    private readonly NoDbFactory _factory;

    public MetricsTests(NoDbFactory factory)
    {
        _factory = factory;
    }

    private static async Task<string> ScrapeDefaultRegistryAsync()
    {
        using var stream = new MemoryStream();
        await Metrics.DefaultRegistry.CollectAndExportAsTextAsync(stream);
        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }

    [Fact]
    public async Task MainAppPort_DoesNotServeMetrics()
    {
        // Signed in, so the fallback auth policy (401 for anonymous callers, even on unknown paths) is not what
        // answers: the main pipeline simply has no /metrics endpoint.
        var client = _factory.CreateClient();
        Mvv42TestAuth.Authenticate(client, Mvv42TestAuth.CreateToken(42, "1"));

        var response = await client.GetAsync("/metrics");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/metrics")).StatusCode);
    }

    [Fact]
    public async Task HttpMetrics_UseRouteTemplate_NotConcretePath()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/accounts/987654321");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode); // route matched, stopped by auth

        var text = await ScrapeDefaultRegistryAsync();
        var lines = text.Split('\n').Where(l => l.StartsWith("http_requests_received_total{")).ToList();

        Assert.Contains(lines, l => l.Contains("endpoint=\"/api/accounts/{id:long}\"") && l.Contains("code=\"4xx\""));
        Assert.DoesNotContain("987654321", text);
    }
}
