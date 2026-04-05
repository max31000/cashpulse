using System.Data;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly string _connectionString;

    public UserRepository(string connectionString) => _connectionString = connectionString;

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<User?> GetByTelegramIdAsync(long telegramId)
    {
        using var conn = CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<User>(
            "SELECT Id, GoogleSubjectId, TelegramId, Email, DisplayName, BaseCurrency, CreatedAt, UpdatedAt " +
            "FROM Users WHERE TelegramId = @TelegramId",
            new { TelegramId = telegramId });
    }

    public async Task<User?> GetByIdAsync(ulong id)
    {
        using var conn = CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<User>(
            "SELECT Id, GoogleSubjectId, TelegramId, Email, DisplayName, BaseCurrency, CreatedAt, UpdatedAt " +
            "FROM Users WHERE Id = @Id",
            new { Id = id });
    }

    public async Task<ulong> CreateAsync(User user)
    {
        using var conn = CreateConnection();
        var id = await conn.ExecuteScalarAsync<ulong>(
            @"INSERT INTO Users (TelegramId, Email, DisplayName, BaseCurrency)
              VALUES (@TelegramId, @Email, @DisplayName, @BaseCurrency);
              SELECT LAST_INSERT_ID();",
            new
            {
                user.TelegramId,
                user.Email,
                user.DisplayName,
                user.BaseCurrency,
            });
        return id;
    }

    public async Task UpdateAsync(User user)
    {
        using var conn = CreateConnection();
        await conn.ExecuteAsync(
            @"UPDATE Users SET DisplayName = @DisplayName, Email = @Email, BaseCurrency = @BaseCurrency
              WHERE Id = @Id",
            new { user.DisplayName, user.Email, user.BaseCurrency, user.Id });
    }
}
