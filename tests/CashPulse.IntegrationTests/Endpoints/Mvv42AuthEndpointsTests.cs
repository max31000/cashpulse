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

    [Fact]
    public async Task LegacyRowWithoutTelegramId_IsUntouched_NewTelegramUserGetsANewId()
    {
        // Mirrors production row id=1 (email user, no Telegram id): a new mvv42 user must never be mapped onto it.
        await using var conn = new MySqlConnection(_factory.Database.ConnectionString);
        await conn.ExecuteAsync(@"INSERT INTO Users (Id, TelegramId, Email, DisplayName, BaseCurrency)
            VALUES (500, NULL, 'legacy-500@local', 'Dev User', 'RUB') ON DUPLICATE KEY UPDATE Email = Email");
        const long telegramId = 5_550_002;

        var client = _factory.CreateClientWithToken(Mvv42TestAuth.CreateToken(telegramId, sub: "500", name: "Новый"));
        (await client.GetAsync("/api/accounts")).StatusCode.Should().Be(HttpStatusCode.OK);

        var legacy = await conn.QuerySingleAsync<(long? TelegramId, string DisplayName, string Email)>(
            "SELECT TelegramId, DisplayName, Email FROM Users WHERE Id = 500");
        legacy.TelegramId.Should().BeNull();
        legacy.DisplayName.Should().Be("Dev User");
        legacy.Email.Should().Be("legacy-500@local");
        (await conn.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Categories WHERE UserId = 500")).Should().Be(0);

        var newId = await conn.ExecuteScalarAsync<ulong>("SELECT Id FROM Users WHERE TelegramId = @telegramId", new { telegramId });
        newId.Should().NotBe(500UL);
        (await conn.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Categories WHERE UserId = @newId", new { newId })).Should().Be(17);
    }

    [Fact]
    public async Task CreateWithCategories_IsAtomic_OnDuplicateTelegramId()
    {
        // A second insert of the same Telegram id fails with 1062 and leaves no orphan categories behind.
        const long telegramId = 5_550_003;
        var repo = new CashPulse.Infrastructure.Repositories.UserRepository(_factory.Database.ConnectionString);
        var first = await repo.CreateWithCategoriesAsync(
            new CashPulse.Core.Models.User { TelegramId = telegramId, DisplayName = "A", BaseCurrency = "RUB" },
            CashPulse.Api.Auth.UserProvisioning.DefaultCategories);

        await using var conn = new MySqlConnection(_factory.Database.ConnectionString);
        var before = await conn.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Categories");

        var act = () => repo.CreateWithCategoriesAsync(
            new CashPulse.Core.Models.User { TelegramId = telegramId, DisplayName = "B", BaseCurrency = "RUB" },
            CashPulse.Api.Auth.UserProvisioning.DefaultCategories);
        (await act.Should().ThrowAsync<MySqlException>()).Which.ErrorCode.Should().Be(MySqlErrorCode.DuplicateKeyEntry);

        (await conn.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Categories")).Should().Be(before);
        (await conn.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Categories WHERE UserId = @first", new { first })).Should().Be(17);
    }
}
