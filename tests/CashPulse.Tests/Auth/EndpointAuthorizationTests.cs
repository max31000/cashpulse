using System.Net;
using System.Text.RegularExpressions;
using CashPulse.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Mvv42.Auth.Client;
using Xunit;

namespace CashPulse.Tests.Auth;

/// <summary>
/// Boots the real API (no database: an unauthenticated request never reaches a repository) and calls every
/// mapped endpoint without the mvv42 cookie: everything except <c>/health</c> must answer 401.
/// </summary>
public class EndpointAuthorizationTests : IClassFixture<EndpointAuthorizationTests.NoDbFactory>
{
    public sealed class NoDbFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing"); // skips migrations
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Server=127.0.0.1;Port=1;Database=none;User=none;Password=none;",
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

    public EndpointAuthorizationTests(NoDbFactory factory)
    {
        _factory = factory;
    }

    private IReadOnlyList<(string Method, string Pattern)> Endpoints()
    {
        _ = _factory.Server; // build the host
        var source = _factory.Services.GetRequiredService<EndpointDataSource>();
        return source.Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(e => (e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"])
                .Select(m => (m, "/" + e.RoutePattern.RawText!.TrimStart('/'))))
            .ToList();
    }

    private static string Concrete(string pattern) => Regex.Replace(pattern, @"\{[^}]+\}", "1");

    [Fact]
    public void EndpointsAreDiscovered()
    {
        var endpoints = Endpoints();
        Assert.Contains(endpoints, e => e is ("GET", "/health"));
        Assert.Contains(endpoints, e => e is ("GET", "/api/accounts/"));
        Assert.Contains(endpoints, e => e is ("POST", "/api/import/csv"));
        Assert.DoesNotContain(endpoints, e => e.Pattern.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase));
        Assert.True(endpoints.Count > 30, $"only {endpoints.Count} endpoints found");
    }

    [Fact]
    public async Task EveryEndpointExceptHealth_Returns401WithoutCookie()
    {
        var client = _factory.CreateClient();
        var failures = new List<string>();

        foreach (var (method, pattern) in Endpoints().Where(e => e.Pattern != "/health"))
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), Concrete(pattern));
            if (method is "POST" or "PUT" or "PATCH")
                request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            request.Headers.Add("Origin", "https://mvv42.ru");

            using var response = await client.SendAsync(request);
            if (response.StatusCode != HttpStatusCode.Unauthorized)
                failures.Add($"{method} {pattern} -> {(int)response.StatusCode}");
        }

        Assert.Empty(failures);
    }

    [Fact]
    public async Task Health_IsAnonymous()
    {
        var response = await _factory.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private HttpClient ClientWith(string token)
    {
        var client = _factory.CreateClient();
        Mvv42TestAuth.Authenticate(client, token);
        return client;
    }

    [Fact]
    public async Task ValidCookie_WithCashpulseApp_PassesAuthorization()
    {
        // Authorization succeeds; the handler then needs the (absent) database, so anything but 401/403 is a pass.
        var response = await ClientWith(Mvv42TestAuth.CreateToken(42, "1")).GetAsync("/api/exchange-rates");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminWithoutCashpulseApp_PassesAuthorization()
    {
        var response = await ClientWith(Mvv42TestAuth.CreateToken(42, "1", apps: [], adm: true)).GetAsync("/api/exchange-rates");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ValidCookie_WithoutCashpulseApp_Returns403()
    {
        var response = await ClientWith(Mvv42TestAuth.CreateToken(42, "1", apps: ["bonds"])).GetAsync("/api/accounts");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ExpiredOrForeignTokens_Return401()
    {
        var expired = Mvv42TestAuth.CreateToken(42, "1", lifetime: TimeSpan.FromMinutes(-5));
        Assert.Equal(HttpStatusCode.Unauthorized, (await ClientWith(expired).GetAsync("/api/accounts")).StatusCode);

        // A Bearer header is not a credential any more (cookie only).
        var bearer = _factory.CreateClient();
        bearer.DefaultRequestHeaders.Authorization = new("Bearer", Mvv42TestAuth.CreateToken(42, "1"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await bearer.GetAsync("/api/accounts")).StatusCode);
    }

    [Fact]
    public async Task UnsafeRequestWithCookieFromForeignOrigin_Returns403()
    {
        var client = ClientWith(Mvv42TestAuth.CreateToken(42, "1"));
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "https://evil.example");
        var response = await client.PostAsync("/api/exchange-rates/refresh", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
