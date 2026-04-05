using System.Data;
using System.Text;
using System.Text.Json;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Repositories;

public class OperationRepository : IOperationRepository
{
    private readonly string _connectionString;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public OperationRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

    public async Task<IEnumerable<PlannedOperation>> GetByUserIdAsync(ulong userId, OperationFilter filter)
    {
        using var conn = CreateConnection();
        var sb = new StringBuilder(@"
            SELECT p.Id, p.UserId, p.AccountId, p.Amount, p.Currency, p.CategoryId, p.Tags,
                   p.Description, p.OperationDate, p.RecurrenceRuleId, p.IsConfirmed, p.ScenarioId,
                   p.CreatedAt, p.UpdatedAt
            FROM PlannedOperations p
            WHERE p.UserId = @UserId");

        var parameters = new DynamicParameters();
        parameters.Add("UserId", userId);

        if (filter.From.HasValue)
        {
            sb.Append(" AND (p.OperationDate IS NULL OR p.OperationDate >= @From)");
            parameters.Add("From", filter.From.Value.ToDateTime(TimeOnly.MinValue));
        }
        if (filter.To.HasValue)
        {
            sb.Append(" AND (p.OperationDate IS NULL OR p.OperationDate <= @To)");
            parameters.Add("To", filter.To.Value.ToDateTime(TimeOnly.MinValue));
        }
        if (filter.AccountId.HasValue)
        {
            sb.Append(" AND p.AccountId = @AccountId");
            parameters.Add("AccountId", filter.AccountId.Value);
        }
        if (filter.CategoryId.HasValue)
        {
            sb.Append(" AND p.CategoryId = @CategoryId");
            parameters.Add("CategoryId", filter.CategoryId.Value);
        }
        if (!string.IsNullOrEmpty(filter.Tag))
        {
            sb.Append(" AND JSON_CONTAINS(p.Tags, @Tag)");
            parameters.Add("Tag", JsonSerializer.Serialize(filter.Tag));
        }
        if (filter.IsConfirmed.HasValue)
        {
            sb.Append(" AND p.IsConfirmed = @IsConfirmed");
            parameters.Add("IsConfirmed", filter.IsConfirmed.Value);
        }
        if (filter.ScenarioId.HasValue)
        {
            sb.Append(" AND p.ScenarioId = @ScenarioId");
            parameters.Add("ScenarioId", filter.ScenarioId.Value);
        }

        sb.Append(" ORDER BY p.OperationDate, p.Id LIMIT @Limit OFFSET @Offset");
        parameters.Add("Limit", filter.Limit);
        parameters.Add("Offset", filter.Offset);

        var rows = await conn.QueryAsync<OperationRow>(sb.ToString(), parameters);
        return rows.Select(MapToOperation);
    }

    public async Task<PlannedOperation?> GetByIdAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT Id, UserId, AccountId, Amount, Currency, CategoryId, Tags, Description,
                   OperationDate, RecurrenceRuleId, IsConfirmed, ScenarioId, CreatedAt, UpdatedAt
            FROM PlannedOperations
            WHERE Id = @Id AND UserId = @UserId";

        var row = await conn.QueryFirstOrDefaultAsync<OperationRow>(sql, new { Id = id, UserId = userId });
        if (row == null) return null;

        var op = MapToOperation(row);
        if (op.RecurrenceRuleId.HasValue)
            op.RecurrenceRule = await GetRecurrenceRuleAsync(conn, op.RecurrenceRuleId.Value);
        return op;
    }

    public async Task<ulong> CreateRecurrenceRuleAsync(RecurrenceRule rule)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO RecurrenceRules (Type, DayOfMonth, Interval_, DaysOfWeek, StartDate, EndDate)
            VALUES (@Type, @DayOfMonth, @Interval_, @DaysOfWeek, @StartDate, @EndDate);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            Type = rule.Type.ToString().ToLower(),
            rule.DayOfMonth,
            Interval_ = rule.Interval,
            DaysOfWeek = rule.DaysOfWeek != null ? JsonSerializer.Serialize(rule.DaysOfWeek) : null,
            StartDate = rule.StartDate.ToDateTime(TimeOnly.MinValue),
            EndDate = rule.EndDate.HasValue ? rule.EndDate.Value.ToDateTime(TimeOnly.MinValue) : (DateTime?)null
        });
    }

    public async Task<ulong> CreateAsync(PlannedOperation operation)
    {
        using var conn = CreateConnection();
        const string sql = @"
            INSERT INTO PlannedOperations (UserId, AccountId, Amount, Currency, CategoryId, Tags,
                                          Description, OperationDate, RecurrenceRuleId, IsConfirmed, ScenarioId)
            VALUES (@UserId, @AccountId, @Amount, @Currency, @CategoryId, @Tags,
                    @Description, @OperationDate, @RecurrenceRuleId, @IsConfirmed, @ScenarioId);
            SELECT LAST_INSERT_ID();";

        return await conn.ExecuteScalarAsync<ulong>(sql, new
        {
            operation.UserId,
            operation.AccountId,
            operation.Amount,
            operation.Currency,
            operation.CategoryId,
            Tags = operation.Tags != null ? JsonSerializer.Serialize(operation.Tags, JsonOpts) : null,
            operation.Description,
            OperationDate = operation.OperationDate.HasValue
                ? operation.OperationDate.Value.ToDateTime(TimeOnly.MinValue)
                : (DateTime?)null,
            operation.RecurrenceRuleId,
            operation.IsConfirmed,
            operation.ScenarioId
        });
    }

    public async Task UpdateAsync(PlannedOperation operation)
    {
        using var conn = CreateConnection();
        const string sql = @"
            UPDATE PlannedOperations
            SET AccountId = @AccountId, Amount = @Amount, Currency = @Currency,
                CategoryId = @CategoryId, Tags = @Tags, Description = @Description,
                OperationDate = @OperationDate, IsConfirmed = @IsConfirmed, ScenarioId = @ScenarioId
            WHERE Id = @Id AND UserId = @UserId";

        await conn.ExecuteAsync(sql, new
        {
            operation.AccountId,
            operation.Amount,
            operation.Currency,
            operation.CategoryId,
            Tags = operation.Tags != null ? JsonSerializer.Serialize(operation.Tags, JsonOpts) : null,
            operation.Description,
            OperationDate = operation.OperationDate.HasValue
                ? operation.OperationDate.Value.ToDateTime(TimeOnly.MinValue)
                : (DateTime?)null,
            operation.IsConfirmed,
            operation.ScenarioId,
            operation.Id,
            operation.UserId
        });
    }

    public async Task DeleteAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "DELETE FROM PlannedOperations WHERE Id = @Id AND UserId = @UserId";
        await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
    }

    public async Task ConfirmAsync(ulong id, ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = "UPDATE PlannedOperations SET IsConfirmed = 1 WHERE Id = @Id AND UserId = @UserId";
        await conn.ExecuteAsync(sql, new { Id = id, UserId = userId });
    }

    public async Task<IEnumerable<PlannedOperation>> GetRecurringAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT p.Id, p.UserId, p.AccountId, p.Amount, p.Currency, p.CategoryId, p.Tags,
                   p.Description, p.OperationDate, p.RecurrenceRuleId, p.IsConfirmed, p.ScenarioId,
                   p.CreatedAt, p.UpdatedAt
            FROM PlannedOperations p
            WHERE p.UserId = @UserId AND p.RecurrenceRuleId IS NOT NULL";

        var rows = await conn.QueryAsync<OperationRow>(sql, new { UserId = userId });
        var ops = rows.Select(MapToOperation).ToList();

        foreach (var op in ops.Where(o => o.RecurrenceRuleId.HasValue))
            op.RecurrenceRule = await GetRecurrenceRuleAsync(conn, op.RecurrenceRuleId!.Value);

        return ops;
    }

    public async Task<IEnumerable<PlannedOperation>> GetAllForForecastAsync(ulong userId)
    {
        using var conn = CreateConnection();
        const string sql = @"
            SELECT p.Id, p.UserId, p.AccountId, p.Amount, p.Currency, p.CategoryId, p.Tags,
                   p.Description, p.OperationDate, p.RecurrenceRuleId, p.IsConfirmed, p.ScenarioId,
                   p.CreatedAt, p.UpdatedAt
            FROM PlannedOperations p
            WHERE p.UserId = @UserId
              AND p.IsConfirmed = FALSE";

        var rows = await conn.QueryAsync<OperationRow>(sql, new { UserId = userId });
        var ops = rows.Select(MapToOperation).ToList();

        // Batch load recurrence rules
        var ruleIds = ops.Where(o => o.RecurrenceRuleId.HasValue)
            .Select(o => o.RecurrenceRuleId!.Value)
            .Distinct()
            .ToList();

        if (ruleIds.Any())
        {
            var rules = await conn.QueryAsync<RecurrenceRuleRow>(
                "SELECT * FROM RecurrenceRules WHERE Id IN @Ids",
                new { Ids = ruleIds });

            var ruleDict = rules.ToDictionary(r => r.Id, MapToRecurrenceRule);
            foreach (var op in ops.Where(o => o.RecurrenceRuleId.HasValue))
            {
                if (ruleDict.TryGetValue(op.RecurrenceRuleId!.Value, out var rule))
                    op.RecurrenceRule = rule;
            }
        }

        return ops;
    }

    private static async Task<RecurrenceRule?> GetRecurrenceRuleAsync(IDbConnection conn, ulong ruleId)
    {
        const string sql = "SELECT Id, Type, DayOfMonth, Interval_, DaysOfWeek, StartDate, EndDate FROM RecurrenceRules WHERE Id = @Id";
        var row = await conn.QueryFirstOrDefaultAsync<RecurrenceRuleRow>(sql, new { Id = ruleId });
        return row == null ? null : MapToRecurrenceRule(row);
    }

    private static PlannedOperation MapToOperation(OperationRow row)
    {
        List<string>? tags = null;
        if (!string.IsNullOrEmpty(row.Tags))
        {
            try { tags = JsonSerializer.Deserialize<List<string>>(row.Tags, JsonOpts); }
            catch { tags = null; }
        }

        return new PlannedOperation
        {
            Id = row.Id,
            UserId = row.UserId,
            AccountId = row.AccountId,
            Amount = row.Amount,
            Currency = row.Currency,
            CategoryId = row.CategoryId,
            Tags = tags,
            Description = row.Description,
            OperationDate = row.OperationDate.HasValue ? DateOnly.FromDateTime(row.OperationDate.Value) : null,
            RecurrenceRuleId = row.RecurrenceRuleId,
            IsConfirmed = row.IsConfirmed,
            ScenarioId = row.ScenarioId,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }

    private static RecurrenceRule MapToRecurrenceRule(RecurrenceRuleRow row)
    {
        List<int>? daysOfWeek = null;
        if (!string.IsNullOrEmpty(row.DaysOfWeek))
        {
            try { daysOfWeek = JsonSerializer.Deserialize<List<int>>(row.DaysOfWeek); }
            catch { daysOfWeek = null; }
        }

        return new RecurrenceRule
        {
            Id = row.Id,
            Type = Enum.Parse<RecurrenceType>(row.Type, true),
            DayOfMonth = row.DayOfMonth,
            Interval = row.Interval_,
            DaysOfWeek = daysOfWeek,
            StartDate = DateOnly.FromDateTime(row.StartDate),
            EndDate = row.EndDate.HasValue ? DateOnly.FromDateTime(row.EndDate.Value) : null
        };
    }

    private class OperationRow
    {
        public ulong Id { get; set; }
        public ulong UserId { get; set; }
        public ulong AccountId { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public ulong? CategoryId { get; set; }
        public string? Tags { get; set; }
        public string? Description { get; set; }
        public DateTime? OperationDate { get; set; }
        public ulong? RecurrenceRuleId { get; set; }
        public bool IsConfirmed { get; set; }
        public ulong? ScenarioId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    private class RecurrenceRuleRow
    {
        public ulong Id { get; set; }
        public string Type { get; set; } = string.Empty;
        public int? DayOfMonth { get; set; }
        public int? Interval_ { get; set; }
        public string? DaysOfWeek { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
    }
}
