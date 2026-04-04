using System.Data;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class CategoryRepository : ICategoryRepository
{
    private readonly string _connectionString;

    public CategoryRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<Category>> GetByUserIdAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, ParentId, Icon, Color, IsSystem, SortOrder
            FROM Categories
            WHERE UserId = @UserId
            ORDER BY SortOrder, Id";

        return await conn.QueryAsync<Category>(sql, new { UserId = userId });
    }

    public async Task<Category?> GetByIdAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, ParentId, Icon, Color, IsSystem, SortOrder
            FROM Categories
            WHERE Id = @Id AND UserId = @UserId";

        return await conn.QueryFirstOrDefaultAsync<Category>(sql, new { Id = id, UserId = userId });
    }

    public async Task<ulong> CreateAsync(Category category)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO Categories (UserId, Name, ParentId, Icon, Color, IsSystem, SortOrder)
            VALUES (@UserId, @Name, @ParentId, @Icon, @Color, @IsSystem, @SortOrder);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            category.UserId,
            category.Name,
            category.ParentId,
            category.Icon,
            category.Color,
            category.IsSystem,
            category.SortOrder
        });
    }

    public async Task UpdateAsync(Category category)
    {
        using var conn = CreateConnection();
        const string sql = @"
            UPDATE Categories
            SET Name = @Name, ParentId = @ParentId, Icon = @Icon, Color = @Color, SortOrder = @SortOrder
            WHERE Id = @Id AND UserId = @UserId AND IsSystem = 0";

        await conn.ExecuteAsync(sql, new
        {
            category.Name,
            category.ParentId,
            category.Icon,
            category.Color,
            category.SortOrder,
            category.Id,
            category.UserId
        });
    }

    public async Task<bool> DeleteAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "DELETE FROM Categories WHERE Id = @Id AND UserId = @UserId AND IsSystem = 0";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }
}
