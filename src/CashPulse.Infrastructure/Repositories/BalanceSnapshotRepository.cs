using System.Data;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class BalanceSnapshotRepository : IBalanceSnapshotRepository
{
    private readonly string _connectionString;

    public BalanceSnapshotRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<BalanceSnapshot>> GetByAccountIdAsync(ulong accountId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, AccountId, Currency, Amount, SnapshotDate, Note, CreatedAt
            FROM BalanceSnapshots
            WHERE AccountId = @AccountId
            ORDER BY SnapshotDate DESC, CreatedAt DESC";

        var rows = await conn.QueryAsync<BalanceSnapshotRow>(sql, new { AccountId = accountId });
        return rows.Select(r => new BalanceSnapshot
        {
            Id = r.Id,
            AccountId = r.AccountId,
            Currency = r.Currency,
            Amount = r.Amount,
            SnapshotDate = DateOnly.FromDateTime(r.SnapshotDate),
            Note = r.Note,
            CreatedAt = r.CreatedAt
        });
    }

    public async Task<ulong> CreateAsync(BalanceSnapshot snapshot)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO BalanceSnapshots (AccountId, Currency, Amount, SnapshotDate, Note)
            VALUES (@AccountId, @Currency, @Amount, @SnapshotDate, @Note);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            snapshot.AccountId,
            snapshot.Currency,
            snapshot.Amount,
            SnapshotDate = snapshot.SnapshotDate.ToDateTime(TimeOnly.MinValue),
            snapshot.Note
        });
    }

    public async Task<BalanceSnapshot?> GetLatestAsync(ulong accountId, string currency)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, AccountId, Currency, Amount, SnapshotDate, Note, CreatedAt
            FROM BalanceSnapshots
            WHERE AccountId = @AccountId AND Currency = @Currency
            ORDER BY SnapshotDate DESC, CreatedAt DESC
            LIMIT 1";

        var row = await conn.QueryFirstOrDefaultAsync<BalanceSnapshotRow>(sql, new { AccountId = accountId, Currency = currency });
        if (row == null) return null;

        return new BalanceSnapshot
        {
            Id = row.Id,
            AccountId = row.AccountId,
            Currency = row.Currency,
            Amount = row.Amount,
            SnapshotDate = DateOnly.FromDateTime(row.SnapshotDate),
            Note = row.Note,
            CreatedAt = row.CreatedAt
        };
    }

    private class BalanceSnapshotRow
    {
        public ulong Id { get; set; }
        public ulong AccountId { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public DateTime SnapshotDate { get; set; }
        public string? Note { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
