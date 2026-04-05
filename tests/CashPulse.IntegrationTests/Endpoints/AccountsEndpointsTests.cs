using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CashPulse.IntegrationTests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace CashPulse.IntegrationTests.Endpoints;

/// <summary>
/// Integration tests for /api/accounts endpoints.
/// Uses a shared TestWebApplicationFactory with a real MySQL 8.0 Testcontainer.
/// </summary>
[Collection("Integration")]
public class AccountsEndpointsTests
{
    private readonly TestWebApplicationFactory _factory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public AccountsEndpointsTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    // ─── GET /api/accounts ──────────────────────────────────────────────────

    [Fact]
    public async Task GetAccounts_AuthenticatedUser_Returns200WithSeededAccounts()
    {
        // Arrange
        var client = _factory.CreateAuthenticatedClient(userId: 1);

        // Act
        var response = await client.GetAsync("/api/accounts");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var accounts = JsonSerializer.Deserialize<List<JsonElement>>(body, JsonOptions);

        accounts.Should().NotBeNull();
        accounts!.Count.Should().BeGreaterThanOrEqualTo(2);
        accounts.Should().Contain(a => a.GetProperty("name").GetString() == "Основной счёт");
        accounts.Should().Contain(a => a.GetProperty("name").GetString() == "Сберегательный");
    }

    [Fact]
    public async Task GetAccounts_Unauthenticated_Returns401()
    {
        // Arrange — no auth header
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/accounts");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetAccounts_WrongUser_ReturnsEmptyList()
    {
        // Arrange — userId=2 has no seeded accounts
        var client = _factory.CreateAuthenticatedClient(userId: 2);

        // Act
        var response = await client.GetAsync("/api/accounts");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var accounts = JsonSerializer.Deserialize<List<JsonElement>>(body, JsonOptions);
        accounts.Should().NotBeNull();
        accounts!.Should().BeEmpty();
    }

    // ─── POST /api/accounts ─────────────────────────────────────────────────

    [Fact]
    public async Task CreateAccount_ValidPayload_Returns201()
    {
        // Arrange
        var client = _factory.CreateAuthenticatedClient(userId: 1);
        var payload = new
        {
            name = "Новый счёт",
            type = "debit",
            sortOrder = 10
        };

        // Act
        var response = await client.PostAsJsonAsync("/api/accounts", payload);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadAsStringAsync();
        var created = JsonSerializer.Deserialize<JsonElement>(body, JsonOptions);
        created.GetProperty("name").GetString().Should().Be("Новый счёт");
        created.GetProperty("type").GetString().Should().BeEquivalentTo("debit");
    }

    [Fact]
    public async Task CreateAccount_EmptyName_Returns400()
    {
        // Arrange
        var client = _factory.CreateAuthenticatedClient(userId: 1);
        var payload = new
        {
            name = "",       // empty name — should fail validation
            type = "debit",
            sortOrder = 0
        };

        // Act
        var response = await client.PostAsJsonAsync("/api/accounts", payload);

        // Assert — ValidationException → 400
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ─── DELETE /api/accounts/{id} ──────────────────────────────────────────
    // ArchiveAccount does a soft-delete (sets IsArchived=true) and returns 204.

    [Fact]
    public async Task DeleteAccount_SoftDeletes_Returns204()
    {
        // Arrange — create a throwaway account first
        var client = _factory.CreateAuthenticatedClient(userId: 1);
        var createPayload = new { name = "Temp Account", type = "cash", sortOrder = 99 };
        var createResp = await client.PostAsJsonAsync("/api/accounts", createPayload);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);

        var createdBody = await createResp.Content.ReadAsStringAsync();
        var created = JsonSerializer.Deserialize<JsonElement>(createdBody, JsonOptions);
        var id = created.GetProperty("id").GetUInt64();

        // Act
        var deleteResp = await client.DeleteAsync($"/api/accounts/{id}");

        // Assert — soft delete returns 204 No Content
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Confirm account is no longer returned (IsArchived=true → filtered out by repo)
        var listResp = await client.GetAsync("/api/accounts");
        var listBody = await listResp.Content.ReadAsStringAsync();
        var accounts = JsonSerializer.Deserialize<List<JsonElement>>(listBody, JsonOptions);
        accounts.Should().NotContain(a => a.GetProperty("id").GetUInt64() == id);
    }

    [Fact]
    public async Task DeleteAccount_NotFound_Returns404()
    {
        // Arrange
        var client = _factory.CreateAuthenticatedClient(userId: 1);

        // Act — use an id that doesn't exist
        var response = await client.DeleteAsync("/api/accounts/999999");

        // Assert — NotFoundException → 404
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
