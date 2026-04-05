using System.Data;
using System.Text.Json;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class IncomeSourceRepository : IIncomeSourceRepository
{
    private readonly string _connectionString;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public IncomeSourceRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<IncomeSource>> GetAllAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, Currency, ExpectedTotal, IsActive, Description, CreatedAt, UpdatedAt
            FROM IncomeSources
            WHERE UserId = @UserId AND IsActive = 1
            ORDER BY Id";

        var sources = (await conn.QueryAsync<IncomeSourceRow>(sql, new { UserId = userId }))
            .Select(MapToIncomeSource)
            .ToList();

        foreach (var source in sources)
        {
            source.Tranches = (await GetTranchesWithRulesAsync(conn, source.Id)).ToList();
        }

        return sources;
    }

    public async Task<IncomeSource?> GetByIdAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, Name, Currency, ExpectedTotal, IsActive, Description, CreatedAt, UpdatedAt
            FROM IncomeSources
            WHERE Id = @Id AND UserId = @UserId";

        var row = await conn.QueryFirstOrDefaultAsync<IncomeSourceRow>(sql, new { Id = id, UserId = userId });
        if (row == null) return null;

        var source = MapToIncomeSource(row);
        source.Tranches = (await GetTranchesWithRulesAsync(conn, source.Id)).ToList();
        return source;
    }

    public async Task<ulong> CreateAsync(IncomeSource source, IEnumerable<IncomeTranche> tranches)
    {
        using var conn = CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        const string insertSource = @"
            INSERT INTO IncomeSources (UserId, Name, Currency, ExpectedTotal, IsActive, Description)
            VALUES (@UserId, @Name, @Currency, @ExpectedTotal, @IsActive, @Description);
            SELECT LAST_INSERT_ID();";

        var sourceId = await conn.ExecuteScalarAsync<ulong>(insertSource, new
        {
            source.UserId,
            source.Name,
            source.Currency,
            source.ExpectedTotal,
            IsActive = source.IsActive ? 1 : 0,
            source.Description
        }, tx);

        foreach (var tranche in tranches)
        {
            var trancheId = await InsertTrancheAsync(conn, tx, sourceId, tranche);

            foreach (var rule in tranche.DistributionRules)
            {
                await InsertDistributionRuleAsync(conn, tx, trancheId, rule);
            }
        }

        tx.Commit();
        return sourceId;
    }

    public async Task UpdateAsync(IncomeSource source, IEnumerable<IncomeTranche> tranches)
    {
        using var conn = CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        const string updateSource = @"
            UPDATE IncomeSources
            SET Name = @Name, Currency = @Currency, ExpectedTotal = @ExpectedTotal,
                IsActive = @IsActive, Description = @Description
            WHERE Id = @Id AND UserId = @UserId";

        await conn.ExecuteAsync(updateSource, new
        {
            source.Name,
            source.Currency,
            source.ExpectedTotal,
            IsActive = source.IsActive ? 1 : 0,
            source.Description,
            source.Id,
            source.UserId
        }, tx);

        // Cascade delete all existing tranches (DistributionRules cascade via FK)
        await conn.ExecuteAsync(
            "DELETE FROM IncomeTranches WHERE IncomeSourceId = @Id",
            new { source.Id },
            tx);

        foreach (var tranche in tranches)
        {
            var trancheId = await InsertTrancheAsync(conn, tx, source.Id, tranche);

            foreach (var rule in tranche.DistributionRules)
            {
                await InsertDistributionRuleAsync(conn, tx, trancheId, rule);
            }
        }

        tx.Commit();
    }

    public async Task<bool> DeactivateAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "UPDATE IncomeSources SET IsActive = 0 WHERE Id = @Id AND UserId = @UserId";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "DELETE FROM IncomeSources WHERE Id = @Id AND UserId = @UserId";
        var rows = await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
        return rows > 0;
    }

    private static async Task<ulong> InsertTrancheAsync(
        IDbConnection conn, IDbTransaction tx, ulong sourceId, IncomeTranche tranche)
    {
        const string sql = @"
            INSERT INTO IncomeTranches
                (IncomeSourceId, Name, DayOfMonth, AmountMode, FixedAmount, PercentOfTotal,
                 EstimatedMin, EstimatedMax, SortOrder)
            VALUES
                (@IncomeSourceId, @Name, @DayOfMonth, @AmountMode, @FixedAmount, @PercentOfTotal,
                 @EstimatedMin, @EstimatedMax, @SortOrder);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            IncomeSourceId = sourceId,
            tranche.Name,
            tranche.DayOfMonth,
            AmountMode = (byte)tranche.AmountMode,
            tranche.FixedAmount,
            tranche.PercentOfTotal,
            tranche.EstimatedMin,
            tranche.EstimatedMax,
            tranche.SortOrder
        }, tx);
    }

    private static async Task InsertDistributionRuleAsync(
        IDbConnection conn, IDbTransaction tx, ulong trancheId, DistributionRule rule)
    {
        const string sql = @"
            INSERT INTO DistributionRules
                (TrancheId, AccountId, Currency, ValueMode, Percent, FixedAmount,
                 DelayDays, CategoryId, Tags, SortOrder)
            VALUES
                (@TrancheId, @AccountId, @Currency, @ValueMode, @Percent, @FixedAmount,
                 @DelayDays, @CategoryId, @Tags, @SortOrder)";

        await conn.ExecuteAsync(sql, new
        {
            TrancheId = trancheId,
            rule.AccountId,
            rule.Currency,
            ValueMode = (byte)rule.ValueMode,
            rule.Percent,
            FixedAmount = rule.FixedAmount,
            rule.DelayDays,
            rule.CategoryId,
            Tags = rule.Tags != null ? JsonSerializer.Serialize(rule.Tags, JsonOpts) : null,
            rule.SortOrder
        }, tx);
    }

    private static async Task<IEnumerable<IncomeTranche>> GetTranchesWithRulesAsync(
        IDbConnection conn, ulong sourceId)
    {
        const string trancheSql = @"
            SELECT Id, IncomeSourceId, Name, DayOfMonth, AmountMode, FixedAmount,
                   PercentOfTotal, EstimatedMin, EstimatedMax, SortOrder, CreatedAt
            FROM IncomeTranches
            WHERE IncomeSourceId = @SourceId
            ORDER BY SortOrder, Id";

        var tranches = (await conn.QueryAsync<IncomeTrancheRow>(trancheSql, new { SourceId = sourceId }))
            .Select(MapToIncomeTranche)
            .ToList();

        if (tranches.Count == 0) return tranches;

        var trancheIds = tranches.Select(t => t.Id).ToList();

        const string rulesSql = @"
            SELECT Id, TrancheId, AccountId, Currency, ValueMode, Percent, FixedAmount,
                   DelayDays, CategoryId, Tags, SortOrder
            FROM DistributionRules
            WHERE TrancheId IN @TrancheIds
            ORDER BY SortOrder, Id";

        var rules = (await conn.QueryAsync<DistributionRuleRow>(rulesSql, new { TrancheIds = trancheIds }))
            .Select(MapToDistributionRule)
            .ToList();

        var rulesByTranche = rules.GroupBy(r => r.TrancheId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var tranche in tranches)
        {
            tranche.DistributionRules = rulesByTranche.TryGetValue(tranche.Id, out var tr) ? tr : new();
        }

        return tranches;
    }

    private static IncomeSource MapToIncomeSource(IncomeSourceRow row) => new()
    {
        Id = row.Id,
        UserId = row.UserId,
        Name = row.Name,
        Currency = row.Currency,
        ExpectedTotal = row.ExpectedTotal,
        IsActive = row.IsActive,
        Description = row.Description,
        CreatedAt = row.CreatedAt,
        UpdatedAt = row.UpdatedAt
    };

    private static IncomeTranche MapToIncomeTranche(IncomeTrancheRow row) => new()
    {
        Id = row.Id,
        IncomeSourceId = row.IncomeSourceId,
        Name = row.Name,
        DayOfMonth = row.DayOfMonth,
        AmountMode = (AmountMode)row.AmountMode,
        FixedAmount = row.FixedAmount,
        PercentOfTotal = row.PercentOfTotal,
        EstimatedMin = row.EstimatedMin,
        EstimatedMax = row.EstimatedMax,
        SortOrder = row.SortOrder,
        CreatedAt = row.CreatedAt
    };

    private static DistributionRule MapToDistributionRule(DistributionRuleRow row)
    {
        List<string>? tags = null;
        if (!string.IsNullOrEmpty(row.Tags))
        {
            try { tags = JsonSerializer.Deserialize<List<string>>(row.Tags, JsonOpts); }
            catch { tags = null; }
        }

        return new DistributionRule
        {
            Id = row.Id,
            TrancheId = row.TrancheId,
            AccountId = row.AccountId,
            Currency = row.Currency,
            ValueMode = (DistributionValueMode)row.ValueMode,
            Percent = row.Percent,
            FixedAmount = row.FixedAmount,
            DelayDays = row.DelayDays,
            CategoryId = row.CategoryId,
            Tags = tags,
            SortOrder = row.SortOrder
        };
    }

    private class IncomeSourceRow
    {
        public ulong Id { get; set; }
        public ulong UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Currency { get; set; } = "RUB";
        public decimal? ExpectedTotal { get; set; }
        public bool IsActive { get; set; }
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    private class IncomeTrancheRow
    {
        public ulong Id { get; set; }
        public ulong IncomeSourceId { get; set; }
        public string Name { get; set; } = string.Empty;
        public int DayOfMonth { get; set; }
        public byte AmountMode { get; set; }
        public decimal? FixedAmount { get; set; }
        public decimal? PercentOfTotal { get; set; }
        public decimal? EstimatedMin { get; set; }
        public decimal? EstimatedMax { get; set; }
        public int SortOrder { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    private class DistributionRuleRow
    {
        public ulong Id { get; set; }
        public ulong TrancheId { get; set; }
        public ulong AccountId { get; set; }
        public string? Currency { get; set; }
        public byte ValueMode { get; set; }
        public decimal? Percent { get; set; }
        public decimal? FixedAmount { get; set; }
        public int DelayDays { get; set; }
        public ulong? CategoryId { get; set; }
        public string? Tags { get; set; }
        public int SortOrder { get; set; }
    }
}
