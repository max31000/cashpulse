using System.Data;
using System.Text.Json;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class AccountRepository : IAccountRepository
{
    private readonly string _connectionString;

    public AccountRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<Account>> GetByUserIdAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, Type, CreditLimit, GracePeriodDays, MinPaymentPercent,
                   StatementDay, DueDay, IsArchived, SortOrder, CreatedAt, UpdatedAt,
                   InterestRate, InterestAccrualDay, DepositEndDate, CanTopUpAlways,
                   CanWithdraw, InvestmentSubtype, GracePeriodEndDate
            FROM Accounts
            WHERE UserId = @UserId AND IsArchived = 0
            ORDER BY SortOrder, Id";

        var accounts = (await conn.QueryAsync<AccountRow>(sql, new { UserId = userId }))
            .Select(MapToAccount)
            .ToList();

        foreach (var account in accounts)
        {
            account.Balances = (await GetBalancesAsync(account.Id)).ToList();
        }

        return accounts;
    }

    public async Task<Account?> GetByIdAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, Type, CreditLimit, GracePeriodDays, MinPaymentPercent,
                   StatementDay, DueDay, IsArchived, SortOrder, CreatedAt, UpdatedAt,
                   InterestRate, InterestAccrualDay, DepositEndDate, CanTopUpAlways,
                   CanWithdraw, InvestmentSubtype, GracePeriodEndDate
            FROM Accounts
            WHERE Id = @Id AND UserId = @UserId";

        var row = await conn.QueryFirstOrDefaultAsync<AccountRow>(sql, new { Id = id, UserId = userId });
        if (row == null) return null;

        var account = MapToAccount(row);
        account.Balances = (await GetBalancesAsync(account.Id)).ToList();
        return account;
    }

    public async Task<ulong> CreateAsync(Account account)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO Accounts (UserId, Name, Type, CreditLimit, GracePeriodDays, MinPaymentPercent,
                                  StatementDay, DueDay, IsArchived, SortOrder,
                                  InterestRate, InterestAccrualDay, DepositEndDate, CanTopUpAlways,
                                  CanWithdraw, InvestmentSubtype, GracePeriodEndDate)
            VALUES (@UserId, @Name, @Type, @CreditLimit, @GracePeriodDays, @MinPaymentPercent,
                    @StatementDay, @DueDay, @IsArchived, @SortOrder,
                    @InterestRate, @InterestAccrualDay, @DepositEndDate, @CanTopUpAlways,
                    @CanWithdraw, @InvestmentSubtype, @GracePeriodEndDate);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            account.UserId,
            account.Name,
            Type = account.Type.ToString().ToLower(),
            account.CreditLimit,
            account.GracePeriodDays,
            account.MinPaymentPercent,
            account.StatementDay,
            account.DueDay,
            account.IsArchived,
            account.SortOrder,
            account.InterestRate,
            account.InterestAccrualDay,
            account.DepositEndDate,
            account.CanTopUpAlways,
            account.CanWithdraw,
            account.InvestmentSubtype,
            account.GracePeriodEndDate
        });
    }

    public async Task UpdateAsync(Account account)
    {
        using var conn = CreateConnection();
        const string sql = @"
            UPDATE Accounts
            SET Name = @Name, Type = @Type, CreditLimit = @CreditLimit,
                GracePeriodDays = @GracePeriodDays, MinPaymentPercent = @MinPaymentPercent,
                StatementDay = @StatementDay, DueDay = @DueDay, SortOrder = @SortOrder,
                InterestRate = @InterestRate, InterestAccrualDay = @InterestAccrualDay,
                DepositEndDate = @DepositEndDate, CanTopUpAlways = @CanTopUpAlways,
                CanWithdraw = @CanWithdraw, InvestmentSubtype = @InvestmentSubtype,
                GracePeriodEndDate = @GracePeriodEndDate
            WHERE Id = @Id AND UserId = @UserId";

        await conn.ExecuteAsync(sql, new
        {
            account.Name,
            Type = account.Type.ToString().ToLower(),
            account.CreditLimit,
            account.GracePeriodDays,
            account.MinPaymentPercent,
            account.StatementDay,
            account.DueDay,
            account.SortOrder,
            account.InterestRate,
            account.InterestAccrualDay,
            account.DepositEndDate,
            account.CanTopUpAlways,
            account.CanWithdraw,
            account.InvestmentSubtype,
            account.GracePeriodEndDate,
            account.Id,
            account.UserId
        });
    }

    public async Task<bool> ArchiveAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "UPDATE Accounts SET IsArchived = 1 WHERE Id = @Id AND UserId = @UserId";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }

    public async Task<IEnumerable<CurrencyBalance>> GetBalancesAsync(ulong accountId)
    {
        using var conn = CreateConnection();
        const string sql = "SELECT AccountId, Currency, Amount FROM CurrencyBalances WHERE AccountId = @AccountId";
        return await conn.QueryAsync<CurrencyBalance>(sql, new { AccountId = accountId });
    }

    public async Task UpdateBalancesAsync(ulong accountId, IEnumerable<CurrencyBalance> balances)
    {
        using var conn = CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync(
            "DELETE FROM CurrencyBalances WHERE AccountId = @AccountId",
            new { AccountId = accountId },
            tx);

        foreach (var balance in balances)
        {
            await conn.ExecuteAsync(
                "INSERT INTO CurrencyBalances (AccountId, Currency, Amount) VALUES (@AccountId, @Currency, @Amount)",
                new { AccountId = accountId, balance.Currency, balance.Amount },
                tx);
        }

        tx.Commit();
    }

    private static Account MapToAccount(AccountRow row)
    {
        return new Account
        {
            Id = row.Id,
            UserId = row.UserId,
            Name = row.Name,
            Type = Enum.Parse<AccountType>(row.Type, true),
            CreditLimit = row.CreditLimit,
            GracePeriodDays = row.GracePeriodDays,
            MinPaymentPercent = row.MinPaymentPercent,
            StatementDay = row.StatementDay,
            DueDay = row.DueDay,
            IsArchived = row.IsArchived,
            SortOrder = row.SortOrder,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt,
            InterestRate = row.InterestRate,
            InterestAccrualDay = row.InterestAccrualDay,
            DepositEndDate = row.DepositEndDate,
            CanTopUpAlways = row.CanTopUpAlways,
            CanWithdraw = row.CanWithdraw,
            InvestmentSubtype = row.InvestmentSubtype,
            GracePeriodEndDate = row.GracePeriodEndDate
        };
    }

    private class AccountRow
    {
        public ulong Id { get; set; }
        public ulong UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public decimal? CreditLimit { get; set; }
        public int? GracePeriodDays { get; set; }
        public decimal? MinPaymentPercent { get; set; }
        public int? StatementDay { get; set; }
        public int? DueDay { get; set; }
        public bool IsArchived { get; set; }
        public int SortOrder { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public decimal? InterestRate { get; set; }
        public int? InterestAccrualDay { get; set; }
        public DateOnly? DepositEndDate { get; set; }
        public bool? CanTopUpAlways { get; set; }
        public bool? CanWithdraw { get; set; }
        public string? InvestmentSubtype { get; set; }
        public DateOnly? GracePeriodEndDate { get; set; }
    }
}
