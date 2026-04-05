using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CashPulse.IntegrationTests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace CashPulse.IntegrationTests.Endpoints;

/// <summary>
/// Integration tests for /api/forecast endpoint.
/// Uses a shared MySQL Testcontainer via TestWebApplicationFactory.
/// </summary>
[Collection("Integration")]
public class ForecastEndpointsTests
{
    private readonly TestWebApplicationFactory _factory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    // Isolated userId to avoid cross-test contamination.
    private const ulong ForecastUserId = 20;

    public ForecastEndpointsTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private async Task<long> CreateAccountWithBalanceAsync(decimal balance, string currency = "RUB")
    {
        var client = _factory.CreateAuthenticatedClient(ForecastUserId);
        await _factory.Database.EnsureUserAsync(ForecastUserId);

        var payload = new { name = "Forecast Account", type = "debit", sortOrder = 0 };
        var resp = await client.PostAsJsonAsync("/api/accounts", payload);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await resp.Content.ReadAsStringAsync();
        var created = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        var accountId = (long)created.GetProperty("id").GetUInt64();

        if (balance != 0m)
            await _factory.Database.SetBalanceAsync((ulong)accountId, currency, balance);

        return accountId;
    }

    private async Task<long> CreateConfirmedOperationAsync(long accountId, decimal amount, string currency = "RUB")
    {
        var client = _factory.CreateAuthenticatedClient(ForecastUserId);
        var payload = new
        {
            accountId,
            amount,
            currency,
            operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
            // Today → isConfirmed=true automatically
        };
        var resp = await client.PostAsJsonAsync("/api/operations", payload);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await resp.Content.ReadAsStringAsync();
        var op = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        op.GetProperty("isConfirmed").GetBoolean().Should().BeTrue(
            "operation with today's date must be auto-confirmed");

        return (long)op.GetProperty("id").GetUInt64();
    }

    // ─── Tests ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetForecast_NoAccounts_Returns200WithEmptyTimelines()
    {
        // Arrange — user 30 has no accounts at all
        const ulong emptyUserId = 30;
        await _factory.Database.EnsureUserAsync(emptyUserId);
        var client = _factory.CreateAuthenticatedClient(emptyUserId);

        // Act
        var response = await client.GetAsync("/api/forecast?horizonMonths=3");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var forecast = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);

        // timelines should be an empty object (no currency keys)
        var timelines = forecast.GetProperty("timelines");
        timelines.EnumerateObject().Should().BeEmpty();
    }

    [Fact]
    public async Task GetForecast_WithAccounts_Returns200WithNonEmptyNetWorth()
    {
        // Arrange — create an account with a balance so the forecast has data
        await _factory.Database.EnsureUserAsync(ForecastUserId);
        await CreateAccountWithBalanceAsync(balance: 25000m);
        var client = _factory.CreateAuthenticatedClient(ForecastUserId);

        // Act
        var response = await client.GetAsync("/api/forecast?horizonMonths=3");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var forecast = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);

        var netWorth = forecast.GetProperty("netWorth");
        netWorth.EnumerateArray().Should().NotBeEmpty(
            "an account with balance 25000 must produce at least one netWorth data point");
    }

    [Fact]
    public async Task GetForecast_ConfirmedOperationsNotDoubled()
    {
        // Arrange ─────────────────────────────────────────────────────────────
        // User 40 is isolated for this test.
        const ulong userId = 40;
        await _factory.Database.EnsureUserAsync(userId);

        var client = _factory.CreateAuthenticatedClient(userId);

        // Create account with balance 10000
        var accountPayload = new { name = "DoubleCheck Account", type = "debit", sortOrder = 0 };
        var accountResp = await client.PostAsJsonAsync("/api/accounts", accountPayload);
        accountResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var accountBody = await accountResp.Content.ReadAsStringAsync();
        var accountJson = JsonSerializer.Deserialize<JsonElement>(accountBody, JsonOptions);
        var accountId = (long)accountJson.GetProperty("id").GetUInt64();

        await _factory.Database.SetBalanceAsync((ulong)accountId, "RUB", 10000m);

        // Create a confirmed operation +5000 (today → auto-confirmed → balance becomes 15000)
        var opPayload = new
        {
            accountId,
            amount = 5000m,
            currency = "RUB",
            operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
        };
        var opResp = await client.PostAsJsonAsync("/api/operations", opPayload);
        opResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var opJson = JsonSerializer.Deserialize<JsonElement>(await opResp.Content.ReadAsStringAsync(), JsonOptions);
        opJson.GetProperty("isConfirmed").GetBoolean().Should().BeTrue();

        // Act
        var forecastResp = await client.GetAsync("/api/forecast?horizonMonths=1");
        forecastResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var forecastBody = await forecastResp.Content.ReadAsStringAsync();
        var forecast = JsonSerializer.Deserialize<JsonElement>(forecastBody, JsonOptions);

        // Assert ───────────────────────────────────────────────────────────────
        // The forecast should reflect the real balance (~15000), NOT double it (~20000).
        // We check the first netWorth point for currency RUB.
        var netWorthPoints = forecast.GetProperty("netWorth")
            .EnumerateArray()
            .Where(p => p.GetProperty("currency").GetString() == "RUB")
            .ToList();

        netWorthPoints.Should().NotBeEmpty("there should be at least one RUB netWorth point");

        // The FIRST point must be approximately 15000 (current balance already includes the operation).
        var firstAmount = netWorthPoints.First().GetProperty("amount").GetDecimal();
        firstAmount.Should().BeApproximately(15000m, precision: 1m,
            "confirmed operation amount is already in the account balance — it must not be added again");

        // It must definitely NOT be ~20000 (i.e. balance 10000 + op 5000 counted twice).
        firstAmount.Should().BeLessThan(20000m,
            "confirmed operations must not be double-counted in the forecast");
    }

    [Fact]
    public async Task GetForecast_HorizonMonths_Respected()
    {
        // Arrange — user 50, account with balance so timeline is non-empty
        const ulong userId = 50;
        await _factory.Database.EnsureUserAsync(userId);

        var client = _factory.CreateAuthenticatedClient(userId);
        var accountPayload = new { name = "Horizon Account", type = "debit", sortOrder = 0 };
        var accountResp = await client.PostAsJsonAsync("/api/accounts", accountPayload);
        accountResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var accountBody = await accountResp.Content.ReadAsStringAsync();
        var accountJson = JsonSerializer.Deserialize<JsonElement>(accountBody, JsonOptions);
        var accountId = (long)accountJson.GetProperty("id").GetUInt64();
        await _factory.Database.SetBalanceAsync((ulong)accountId, "RUB", 1000m);

        // Act — request a 2-month horizon
        var response = await client.GetAsync("/api/forecast?horizonMonths=2");

        // Assert — 400 is NOT returned; response is OK
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // Also verify the validation boundary: horizonMonths=0 must return 400
        var invalidResponse = await client.GetAsync("/api/forecast?horizonMonths=0");
        invalidResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // And horizonMonths=25 must also return 400
        var tooLargeResponse = await client.GetAsync("/api/forecast?horizonMonths=25");
        tooLargeResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
