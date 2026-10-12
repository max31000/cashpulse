using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CashPulse.IntegrationTests.Infrastructure;
using Dapper;
using FluentAssertions;
using MySqlConnector;
using Xunit;

namespace CashPulse.IntegrationTests.Endpoints;

/// <summary>Shared mvv42 auth end to end: cookie → policy → local user by <c>tg</c> (never by <c>sub</c>).</summary>
[Collection("Integration")]
public class Mvv42AuthEndpointsTests
{
    private readonly TestWebApplicationFactory _factory;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public Mvv42AuthEndpointsTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Health_IsAnonymous()
    {
        var response = await _factory.CreateClient().GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task LocalUser_IsResolvedByTelegramId_NotBySub()
    {
        // sub "2" names local user 2 by coincidence; tg names local user 1 — user 1's accounts must come back.
        var token = Mvv42TestAuth.CreateToken(Mvv42TestAuth.TelegramIdFor(1), sub: "2");
        var client = _factory.CreateClientWithToken(token);

        var accounts = await client.GetFromJsonAsync<List<JsonElement>>("/api/accounts", JsonOptions);

        accounts.Should().Contain(a => a.GetProperty("name").GetString() == "Основной счёт");
    }

    [Fact]
    public async Task NewTelegramUser_IsProvisionedWithDefaultCategories()
    {
        const long telegramId = 5_550_001;
        var client = _factory.CreateClientWithToken(Mvv42TestAuth.CreateToken(telegramId, sub: "1", name: "Новый Пользователь"));

        // Parallel first requests of a new user must create exactly one row.
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.GetAsync("/api/categories")));
        responses.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.OK);

        var categories = await responses[0].Content.ReadFromJsonAsync<List<JsonElement>>(JsonOptions);
        categories.Should().HaveCount(17);

        await using var conn = new MySqlConnection(_factory.Database.ConnectionString);
        var rows = (await conn.QueryAsync<(ulong Id, string DisplayName)>(
            "SELECT Id, DisplayName FROM Users WHERE TelegramId = @telegramId", new { telegramId })).ToList();
        rows.Should().ContainSingle();
        rows[0].DisplayName.Should().Be("Новый Пользователь");
        rows[0].Id.Should().NotBe(1UL);
    }

    [Fact]
    public async Task TokenWithoutCashpulseApp_Returns403()
    {
        var token = Mvv42TestAuth.CreateToken(Mvv42TestAuth.TelegramIdFor(1), sub: "1", apps: ["bonds"]);
        var response = await _factory.CreateClientWithToken(token).GetAsync("/api/accounts");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ExpiredToken_Returns401()
    {
        var token = Mvv42TestAuth.CreateToken(Mvv42TestAuth.TelegramIdFor(1), sub: "1", lifetime: TimeSpan.FromMinutes(-5));
        var response = await _factory.CreateClientWithToken(token).GetAsync("/api/accounts");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task UnsafeRequestFromForeignOrigin_Returns403()
    {
        var client = _factory.CreateAuthenticatedClient(1);
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "https://evil.example");

        var response = await client.PostAsJsonAsync("/api/accounts", new { name = "x", type = "debit", sortOrder = 0 });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
