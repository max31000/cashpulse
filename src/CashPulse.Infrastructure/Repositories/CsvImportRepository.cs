using System.Data;
using System.Text.Json;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class CsvImportRepository : ICsvImportRepository
{
    private readonly string _connectionString;

    public CsvImportRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<CsvImportSession>> GetByUserIdAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, FileName, ColumnMapping, ImportedAt, OperationsImported
            FROM CsvImportSessions
            WHERE UserId = @UserId
            ORDER BY ImportedAt DESC";

        var rows = await conn.QueryAsync<CsvImportSessionRow>(sql, new { UserId = userId });
        return rows.Select(r => new CsvImportSession
        {
            Id = r.Id,
            UserId = r.UserId,
            FileName = r.FileName,
            ColumnMapping = string.IsNullOrEmpty(r.ColumnMapping)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(r.ColumnMapping) ?? new(),
            ImportedAt = r.ImportedAt,
            OperationsImported = r.OperationsImported
        });
    }

    public async Task<ulong> CreateSessionAsync(CsvImportSession session)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO CsvImportSessions (UserId, FileName, ColumnMapping, OperationsImported)
            VALUES (@UserId, @FileName, @ColumnMapping, @OperationsImported);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            session.UserId,
            session.FileName,
            ColumnMapping = JsonSerializer.Serialize(session.ColumnMapping),
            session.OperationsImported
        });
    }

    private class CsvImportSessionRow
    {
        public ulong Id { get; set; }
        public ulong UserId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string ColumnMapping { get; set; } = string.Empty;
        public DateTime ImportedAt { get; set; }
        public int OperationsImported { get; set; }
    }
}
