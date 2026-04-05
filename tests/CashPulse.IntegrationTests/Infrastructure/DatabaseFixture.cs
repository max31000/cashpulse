using Dapper;
using Microsoft.Extensions.Logging.Abstractions;
using MySqlConnector;
using Testcontainers.MySql;
using CashPulse.Infrastructure;
using Xunit;

namespace CashPulse.IntegrationTests.Infrastructure;

/// <summary>
/// Spins up a MySQL 8.0 container, runs migrations, and seeds test data.
/// Tables: Users, Accounts, CurrencyBalances (from 001_initial_schema.sql).
/// </summary>
public class DatabaseFixture : IAsyncLifetime
{
    private readonly MySqlContainer _container = new MySqlBuilder()
        .WithImage("mysql:8.0")
        .WithDatabase("cashpulse_test")
        .WithUsername("testuser")
        .WithPassword("testpassword")
        .Build();

    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();

        // Run migrations via MigrationRunner (constructor: string connectionString, ILogger<MigrationRunner>)
        var logger = NullLogger<MigrationRunner>.Instance;
        var runner = new MigrationRunner(ConnectionString, logger);
        await runner.RunAsync();

        await SeedAsync();
    }

    public async Task DisposeAsync()
    {
        await _container.StopAsync();
        await _container.DisposeAsync();
    }

    private async Task SeedAsync()
    {
        await using var conn = new MySqlConnection(ConnectionString);
        await conn.OpenAsync();

        // Seed user with Id=1
        await conn.ExecuteAsync(@"
            INSERT INTO Users (Id, Email, DisplayName, BaseCurrency)
            VALUES (1, 'test@example.com', 'Test User', 'RUB')
            ON DUPLICATE KEY UPDATE Email = Email");

        // Seed user with Id=2 (for wrong-user tests)
        await conn.ExecuteAsync(@"
            INSERT INTO Users (Id, Email, DisplayName, BaseCurrency)
            VALUES (2, 'other@example.com', 'Other User', 'RUB')
            ON DUPLICATE KEY UPDATE Email = Email");

        // Seed two accounts for UserId=1
        await conn.ExecuteAsync(@"
            INSERT INTO Accounts (Id, UserId, Name, Type, IsArchived, SortOrder)
            VALUES
                (1, 1, 'Основной счёт', 'debit', 0, 0),
                (2, 1, 'Сберегательный', 'debit', 0, 1)
            ON DUPLICATE KEY UPDATE Name = Name");

        // Seed balances in CurrencyBalances
        await conn.ExecuteAsync(@"
            INSERT INTO CurrencyBalances (AccountId, Currency, Amount)
            VALUES
                (1, 'RUB', 100000.00),
                (2, 'RUB', 50000.00)
            ON DUPLICATE KEY UPDATE Amount = Amount");
    }

    /// <summary>
    /// Cleans Accounts (and cascades to CurrencyBalances) for UserId=1 but preserves the seeded user rows.
    /// Use in tests that create/modify accounts to avoid state leakage.
    /// </summary>
    public async Task ResetAccountsAsync(ulong userId = 1)
    {
        await using var conn = new MySqlConnection(ConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync("DELETE FROM Accounts WHERE UserId = @UserId", new { UserId = userId });
    }

    /// <summary>
    /// Inserts a user row if it doesn't exist yet (idempotent).
    /// Used by tests that operate under a userId other than 1 or 2.
    /// </summary>
    public async Task EnsureUserAsync(ulong userId)
    {
        await using var conn = new MySqlConnection(ConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync(@"
            INSERT INTO Users (Id, Email, DisplayName, BaseCurrency)
            VALUES (@Id, @Email, @DisplayName, 'RUB')
            ON DUPLICATE KEY UPDATE Email = Email",
            new { Id = userId, Email = $"user{userId}@test.com", DisplayName = $"User {userId}" });
    }

    /// <summary>
    /// Directly sets a CurrencyBalance for the given account.
    /// Useful for seeding an initial balance without going through the API.
    /// </summary>
    public async Task SetBalanceAsync(ulong accountId, string currency, decimal amount)
    {
        await using var conn = new MySqlConnection(ConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync(@"
            INSERT INTO CurrencyBalances (AccountId, Currency, Amount)
            VALUES (@AccountId, @Currency, @Amount)
            ON DUPLICATE KEY UPDATE Amount = @Amount",
            new { AccountId = accountId, Currency = currency.ToUpper(), Amount = amount });
    }
}
