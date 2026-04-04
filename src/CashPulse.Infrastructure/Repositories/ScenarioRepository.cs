using System.Data;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class ScenarioRepository : IScenarioRepository
{
    private readonly string _connectionString;

    public ScenarioRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<Scenario>> GetByUserIdAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "SELECT Id, UserId, Name, Description, IsActive, CreatedAt FROM Scenarios WHERE UserId = @UserId ORDER BY CreatedAt DESC";
        return await conn.QueryAsync<Scenario>(sql, new { UserId = userId });
    }

    public async Task<Scenario?> GetByIdAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "SELECT Id, UserId, Name, Description, IsActive, CreatedAt FROM Scenarios WHERE Id = @Id AND UserId = @UserId";
        return await conn.QueryFirstOrDefaultAsync<Scenario>(sql, new { Id = id, UserId = userId });
    }

    public async Task<ulong> CreateAsync(Scenario scenario)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO Scenarios (UserId, Name, Description, IsActive)
            VALUES (@UserId, @Name, @Description, @IsActive);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            scenario.UserId,
            scenario.Name,
            scenario.Description,
            scenario.IsActive
        });
    }

    public async Task UpdateAsync(Scenario scenario)
    {
        using var conn = CreateConnection();
        const string sql = "UPDATE Scenarios SET Name = @Name, Description = @Description WHERE Id = @Id AND UserId = @UserId";
        await conn.ExecuteAsync(sql, new
        {
            scenario.Name,
            scenario.Description,
            scenario.Id,
            scenario.UserId
        });
    }

    public async Task<bool> DeleteAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "DELETE FROM Scenarios WHERE Id = @Id AND UserId = @UserId";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }

    public async Task<bool> ToggleActiveAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "UPDATE Scenarios SET IsActive = NOT IsActive WHERE Id = @Id AND UserId = @UserId";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }

    public async Task<IEnumerable<Scenario>> GetActiveAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "SELECT Id, UserId, Name, Description, IsActive, CreatedAt FROM Scenarios WHERE UserId = @UserId AND IsActive = 1";
        return await conn.QueryAsync<Scenario>(sql, new { UserId = userId });
    }
}
