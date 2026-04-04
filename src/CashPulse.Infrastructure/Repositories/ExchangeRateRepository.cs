using System.Data;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class ExchangeRateRepository : IExchangeRateRepository
{
    private readonly string _connectionString;

    public ExchangeRateRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<ExchangeRate>> GetAllAsync()
    {
        using var conn = CreateConnection();
        const string sql = "SELECT FromCurrency, ToCurrency, Rate, UpdatedAt FROM ExchangeRates";
        return await conn.QueryAsync<ExchangeRate>(sql);
    }

    public async Task<ExchangeRate?> GetByPairAsync(string fromCurrency, string toCurrency)
    {
        using var conn = CreateConnection();
        const string sql = "SELECT FromCurrency, ToCurrency, Rate, UpdatedAt FROM ExchangeRates WHERE FromCurrency = @From AND ToCurrency = @To";
        return await conn.QueryFirstOrDefaultAsync<ExchangeRate>(sql, new { From = fromCurrency, To = toCurrency });
    }

    public async Task UpsertAsync(ExchangeRate rate)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO ExchangeRates (FromCurrency, ToCurrency, Rate)
            VALUES (@FromCurrency, @ToCurrency, @Rate)
            ON DUPLICATE KEY UPDATE Rate = @Rate, UpdatedAt = CURRENT_TIMESTAMP";

        await conn.ExecuteAsync(sql, new
        {
            rate.FromCurrency,
            rate.ToCurrency,
            rate.Rate
        });
    }

    public async Task UpsertManyAsync(IEnumerable<ExchangeRate> rates)
    {
        using var conn = CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        const string sql = @"
            INSERT INTO ExchangeRates (FromCurrency, ToCurrency, Rate)
            VALUES (@FromCurrency, @ToCurrency, @Rate)
            ON DUPLICATE KEY UPDATE Rate = @Rate, UpdatedAt = CURRENT_TIMESTAMP";

        foreach (var rate in rates)
        {
            await conn.ExecuteAsync(sql, new
            {
                rate.FromCurrency,
                rate.ToCurrency,
                rate.Rate
            }, tx);
        }

        tx.Commit();
    }
}
