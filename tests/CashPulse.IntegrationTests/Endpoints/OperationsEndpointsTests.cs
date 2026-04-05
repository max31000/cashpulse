using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CashPulse.IntegrationTests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace CashPulse.IntegrationTests.Endpoints;

/// <summary>
/// Integration tests for /api/operations endpoints.
/// Uses a shared MySQL Testcontainer via TestWebApplicationFactory.
/// </summary>
[Collection("Integration")]
public class OperationsEndpointsTests
{
    private readonly TestWebApplicationFactory _factory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    // UserId=10 is isolated for operations tests to avoid interfering with other test classes.
    private const ulong TestUserId = 10;

    public OperationsEndpointsTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /// <summary>Creates a fresh account for TestUserId and returns its id.</summary>
    private async Task<long> CreateAccountAsync(decimal initialBalance = 0m, string currency = "RUB")
    {
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        // Ensure the user row exists (seed inserts users 1 and 2; we need 10).
        await _factory.Database.EnsureUserAsync(TestUserId);

        var payload = new { name = "Op Test Account", type = "debit", sortOrder = 0 };
        var resp = await client.PostAsJsonAsync("/api/accounts", payload);
        resp.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await resp.Content.ReadAsStringAsync();
        var created = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        var accountId = (long)created.GetProperty("id").GetUInt64();

        // Set initial balance directly if requested.
        if (initialBalance != 0m)
            await _factory.Database.SetBalanceAsync((ulong)accountId, currency, initialBalance);

        return accountId;
    }

    private static object TodayOperationPayload(long accountId, decimal amount = 1000m) => new
    {
        accountId,
        amount,
        currency = "RUB",
        operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
    };

    private static object FutureOperationPayload(long accountId, decimal amount = 1000m) => new
    {
        accountId,
        amount,
        currency = "RUB",
        operationDate = DateOnly.FromDateTime(DateTime.Today).AddDays(30).ToString("yyyy-MM-dd"),
    };

    // ─── GET /api/operations ────────────────────────────────────────────────

    [Fact]
    public async Task GetOperations_AuthenticatedUser_Returns200()
    {
        // Arrange
        var client = _factory.CreateAuthenticatedClient(userId: 1);

        // Act
        var response = await client.GetAsync("/api/operations");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var ops = JsonSerializer.Deserialize<List<JsonElement>>(body, JsonOptions);
        ops.Should().NotBeNull();
    }

    [Fact]
    public async Task GetOperations_Unauthenticated_Returns401()
    {
        // Arrange — no auth header
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/operations");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ─── POST /api/operations ───────────────────────────────────────────────

    [Fact]
    public async Task CreateOperation_TodayDate_Returns201AndIsConfirmed()
    {
        // Arrange
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync();
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        // Act
        var response = await client.PostAsJsonAsync("/api/operations", TodayOperationPayload(accountId));

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadAsStringAsync();
        var op = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        op.GetProperty("isConfirmed").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task CreateOperation_FutureDate_Returns201AndNotConfirmed()
    {
        // Arrange
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync();
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        // Act
        var response = await client.PostAsJsonAsync("/api/operations", FutureOperationPayload(accountId));

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadAsStringAsync();
        var op = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        op.GetProperty("isConfirmed").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task CreateOperation_ZeroAmount_Returns400()
    {
        // Arrange
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync();
        var client = _factory.CreateAuthenticatedClient(TestUserId);
        var payload = new
        {
            accountId,
            amount = 0,
            currency = "RUB",
            operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
        };

        // Act
        var response = await client.PostAsJsonAsync("/api/operations", payload);

        // Assert — ValidationException → 400
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateOperation_TodayDate_UpdatesAccountBalance()
    {
        // Arrange
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync(initialBalance: 5000m);
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        // Act — create a confirmed (+2000) operation
        var createResp = await client.PostAsJsonAsync("/api/operations", new
        {
            accountId,
            amount = 2000m,
            currency = "RUB",
            operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
        });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        // Assert — account balance should be 5000 + 2000 = 7000
        var accountResp = await client.GetAsync($"/api/accounts/{accountId}");
        accountResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var accountBody = await accountResp.Content.ReadAsStringAsync();
        var account = JsonSerializer.Deserialize<JsonElement>(accountBody, JsonOptions);

        var balances = account.GetProperty("balances");
        var rubBalance = balances.EnumerateArray()
            .First(b => b.GetProperty("currency").GetString() == "RUB");
        rubBalance.GetProperty("amount").GetDecimal().Should().Be(7000m);
    }

    // ─── DELETE /api/operations/{id} ────────────────────────────────────────

    [Fact]
    public async Task DeleteOperation_Confirmed_RollsBackBalance()
    {
        // Arrange — account with 10000, create confirmed operation +3000 → balance 13000
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync(initialBalance: 10000m);
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        var createResp = await client.PostAsJsonAsync("/api/operations", new
        {
            accountId,
            amount = 3000m,
            currency = "RUB",
            operationDate = DateOnly.FromDateTime(DateTime.Today).ToString("yyyy-MM-dd"),
        });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var createBody = await createResp.Content.ReadAsStringAsync();
        var createdOp = JsonSerializer.Deserialize<JsonElement>(createBody, JsonOptions);
        var opId = createdOp.GetProperty("id").GetUInt64();

        // Verify balance is 13000 after creation
        var balanceBefore = await GetRubBalanceAsync(client, accountId);
        balanceBefore.Should().Be(13000m);

        // Act — delete the confirmed operation
        var deleteResp = await client.DeleteAsync($"/api/operations/{opId}");
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Assert — balance rolled back to 10000
        var balanceAfter = await GetRubBalanceAsync(client, accountId);
        balanceAfter.Should().Be(10000m);
    }

    // ─── POST /api/operations/{id}/confirm ──────────────────────────────────

    [Fact]
    public async Task ConfirmOperation_Unconfirmed_UpdatesBalance()
    {
        // Arrange — account with 5000, create unconfirmed (future) operation +2000
        await _factory.Database.EnsureUserAsync(TestUserId);
        var accountId = await CreateAccountAsync(initialBalance: 5000m);
        var client = _factory.CreateAuthenticatedClient(TestUserId);

        var createResp = await client.PostAsJsonAsync("/api/operations", FutureOperationPayload(accountId, 2000m));
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var createBody = await createResp.Content.ReadAsStringAsync();
        var createdOp = JsonSerializer.Deserialize<JsonElement>(createBody, JsonOptions);
        var opId = createdOp.GetProperty("id").GetUInt64();
        createdOp.GetProperty("isConfirmed").GetBoolean().Should().BeFalse();

        // Balance must still be 5000 (unconfirmed doesn't touch balance)
        var balanceBefore = await GetRubBalanceAsync(client, accountId);
        balanceBefore.Should().Be(5000m);

        // Act — confirm the operation
        var confirmResp = await client.PostAsync($"/api/operations/{opId}/confirm", null);
        confirmResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Assert — balance is now 5000 + 2000 = 7000
        var balanceAfter = await GetRubBalanceAsync(client, accountId);
        balanceAfter.Should().Be(7000m);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private async Task<decimal> GetRubBalanceAsync(HttpClient client, long accountId)
    {
        var resp = await client.GetAsync($"/api/accounts/{accountId}");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadAsStringAsync();
        var account = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);

        var balances = account.GetProperty("balances");
        var rub = balances.EnumerateArray()
            .FirstOrDefault(b => b.GetProperty("currency").GetString() == "RUB");

        return rub.ValueKind == JsonValueKind.Undefined ? 0m : rub.GetProperty("amount").GetDecimal();
    }
}
