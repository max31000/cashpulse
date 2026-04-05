using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using CashPulse.Core.Services;

namespace CashPulse.Api.Endpoints;

public static class IncomeSourceEndpoints
{
    public static void MapIncomeSourceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/income-sources");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:long}", GetById);
        group.MapPost("/", Create);
        group.MapPut("/{id:long}", Update);
        group.MapDelete("/{id:long}", Delete);
        group.MapPost("/{id:long}/generate", Generate);
        group.MapPost("/{id:long}/confirm-tranche", ConfirmTranche);
    }

    private static ulong GetUserId(HttpContext ctx) => (ulong)ctx.Items["UserId"]!;

    // GET /api/income-sources
    private static async Task<IResult> GetAll(HttpContext ctx, IIncomeSourceRepository repo)
    {
        var userId = GetUserId(ctx);
        var sources = await repo.GetAllAsync(userId);
        return Results.Ok(sources);
    }

    // GET /api/income-sources/{id}
    private static async Task<IResult> GetById(long id, HttpContext ctx, IIncomeSourceRepository repo)
    {
        var userId = GetUserId(ctx);
        var source = await repo.GetByIdAsync((ulong)id, userId);
        if (source == null) throw new NotFoundException($"IncomeSource {id} not found");
        return Results.Ok(source);
    }

    // POST /api/income-sources
    private static async Task<IResult> Create(
        IncomeSourceCreateRequest req,
        HttpContext ctx,
        IIncomeSourceRepository repo)
    {
        var userId = GetUserId(ctx);

        if (string.IsNullOrWhiteSpace(req.Name))
            throw new ValidationException("Name is required");

        var source = new IncomeSource
        {
            UserId = userId,
            Name = req.Name.Trim(),
            Currency = req.Currency?.ToUpper() ?? "RUB",
            ExpectedTotal = req.ExpectedTotal,
            IsActive = true,
            Description = req.Description
        };

        var tranches = MapTranches(req.Tranches);
        var createdId = await repo.CreateAsync(source, tranches);
        var created = await repo.GetByIdAsync(createdId, userId);
        return Results.Created($"/api/income-sources/{createdId}", created);
    }

    // PUT /api/income-sources/{id}
    private static async Task<IResult> Update(
        long id,
        IncomeSourceUpdateRequest req,
        HttpContext ctx,
        IIncomeSourceRepository repo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"IncomeSource {id} not found");

        existing.Name = req.Name?.Trim() ?? existing.Name;
        if (req.Currency != null) existing.Currency = req.Currency.ToUpper();
        if (req.ExpectedTotal.HasValue) existing.ExpectedTotal = req.ExpectedTotal;
        if (req.Description != null) existing.Description = req.Description;
        if (req.IsActive.HasValue) existing.IsActive = req.IsActive.Value;

        var tranches = req.Tranches != null
            ? MapTranches(req.Tranches)
            : existing.Tranches;

        await repo.UpdateAsync(existing, tranches);
        var updated = await repo.GetByIdAsync((ulong)id, userId);
        return Results.Ok(updated);
    }

    // DELETE /api/income-sources/{id}
    private static async Task<IResult> Delete(long id, HttpContext ctx, IIncomeSourceRepository repo)
    {
        var userId = GetUserId(ctx);
        var success = await repo.DeleteAsync((ulong)id, userId);
        if (!success) throw new NotFoundException($"IncomeSource {id} not found");
        return Results.NoContent();
    }

    // POST /api/income-sources/{id}/generate
    private static async Task<IResult> Generate(
        long id,
        IncomeGenerateRequest req,
        HttpContext ctx,
        IIncomeSourceRepository repo,
        IOperationRepository opRepo,
        IncomeSourceExpander expander)
    {
        var userId = GetUserId(ctx);
        var source = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"IncomeSource {id} not found");

        if (!DateOnly.TryParse(req.From, out var from))
            throw new ValidationException("Invalid 'from' date. Use yyyy-MM-dd.");
        if (!DateOnly.TryParse(req.To, out var to))
            throw new ValidationException("Invalid 'to' date. Use yyyy-MM-dd.");
        if (from > to)
            throw new ValidationException("'from' must not be after 'to'.");

        // Build dedupe set from existing operations with income-source tag
        HashSet<string>? existingTags = null;
        if (!req.Preview)
        {
            var dedupeTag = $"income-source:{source.Id}";
            var existing = await opRepo.GetByUserIdAsync(userId, new CashPulse.Core.Interfaces.Repositories.OperationFilter
            {
                From = from,
                To = to,
                Tag = dedupeTag,
                Limit = 10000
            });

            existingTags = new HashSet<string>(
                existing
                    .Where(o => o.Tags != null)
                    .SelectMany(o => o.Tags!)
                    .Distinct());
        }

        var results = expander.Expand(
            source,
            from,
            to,
            req.ActualAmount,
            req.TrancheId,
            existingTags);

        if (req.Preview)
            return Results.Ok(results);

        // Save non-duplicate operations
        var saved = new List<ulong>();
        foreach (var r in results.Where(r => !r.IsDuplicate))
        {
            var op = new PlannedOperation
            {
                UserId = userId,
                AccountId = r.AccountId,
                Amount = r.Amount,
                Currency = r.Currency,
                CategoryId = r.CategoryId,
                Tags = r.Tags,
                Description = r.Description,
                OperationDate = r.OperationDate,
                IsConfirmed = false
            };
            var opId = await opRepo.CreateAsync(op);
            saved.Add(opId);
        }

        return Results.Ok(new
        {
            preview = false,
            generated = saved.Count,
            skippedDuplicates = results.Count(r => r.IsDuplicate),
            operationIds = saved
        });
    }

    // POST /api/income-sources/{id}/confirm-tranche
    private static async Task<IResult> ConfirmTranche(
        long id,
        ConfirmTrancheRequest req,
        HttpContext ctx,
        IIncomeSourceRepository repo,
        IOperationRepository opRepo,
        IncomeSourceExpander expander)
    {
        var userId = GetUserId(ctx);
        var source = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"IncomeSource {id} not found");

        // Parse month: yyyy-MM
        if (!DateOnly.TryParseExact(req.Month + "-01", "yyyy-MM-dd",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var monthStart))
            throw new ValidationException("Invalid 'month'. Use yyyy-MM format.");

        var monthEnd = new DateOnly(monthStart.Year, monthStart.Month,
            DateTime.DaysInMonth(monthStart.Year, monthStart.Month));

        var trancheTag = $"tranche:{req.TrancheId}";

        // Find existing operations for this tranche in the month
        var existingOps = (await opRepo.GetByUserIdAsync(userId, new CashPulse.Core.Interfaces.Repositories.OperationFilter
        {
            From = monthStart,
            To = monthEnd,
            Tag = trancheTag,
            Limit = 10000
        })).ToList();

        // Delete old ones
        foreach (var op in existingOps)
        {
            await opRepo.DeleteAsync(op.Id, userId);
        }

        // Re-expand for just this tranche in the month
        var newOps = expander.Expand(
            source,
            monthStart,
            monthEnd,
            req.ActualAmount,
            req.TrancheId);

        var createdIds = new List<ulong>();
        foreach (var r in newOps)
        {
            var op = new PlannedOperation
            {
                UserId = userId,
                AccountId = r.AccountId,
                Amount = r.Amount,
                Currency = r.Currency,
                CategoryId = r.CategoryId,
                Tags = r.Tags,
                Description = r.Description,
                OperationDate = r.OperationDate,
                IsConfirmed = true
            };
            var opId = await opRepo.CreateAsync(op);
            createdIds.Add(opId);
        }

        return Results.Ok(new
        {
            month = req.Month,
            trancheId = req.TrancheId,
            replaced = existingOps.Count,
            created = createdIds.Count,
            operationIds = createdIds
        });
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static List<IncomeTranche> MapTranches(IEnumerable<TrancheRequest>? trancheRequests)
    {
        if (trancheRequests == null) return new();

        return trancheRequests.Select(t => new IncomeTranche
        {
            Name = t.Name,
            DayOfMonth = t.DayOfMonth,
            AmountMode = Enum.TryParse<AmountMode>(t.AmountMode, true, out var am) ? am : AmountMode.Fixed,
            FixedAmount = t.FixedAmount,
            PercentOfTotal = t.PercentOfTotal,
            EstimatedMin = t.EstimatedMin,
            EstimatedMax = t.EstimatedMax,
            SortOrder = t.SortOrder,
            DistributionRules = (t.DistributionRules ?? Enumerable.Empty<DistributionRuleRequest>())
                .Select(dr => new DistributionRule
                {
                    AccountId = dr.AccountId,
                    Currency = dr.Currency,
                    ValueMode = Enum.TryParse<DistributionValueMode>(dr.ValueMode, true, out var vm)
                        ? vm
                        : DistributionValueMode.Remainder,
                    Percent = dr.Percent,
                    FixedAmount = dr.FixedAmount,
                    DelayDays = dr.DelayDays,
                    CategoryId = dr.CategoryId,
                    Tags = dr.Tags,
                    SortOrder = dr.SortOrder
                }).ToList()
        }).ToList();
    }
}

// ── Request records ────────────────────────────────────────────────────────────

public record IncomeSourceCreateRequest(
    string Name,
    string? Currency,
    decimal? ExpectedTotal,
    string? Description,
    List<TrancheRequest>? Tranches);

public record IncomeSourceUpdateRequest(
    string? Name,
    string? Currency,
    decimal? ExpectedTotal,
    string? Description,
    bool? IsActive,
    List<TrancheRequest>? Tranches);

public record TrancheRequest(
    string Name,
    int DayOfMonth,
    string AmountMode,
    decimal? FixedAmount,
    decimal? PercentOfTotal,
    decimal? EstimatedMin,
    decimal? EstimatedMax,
    int SortOrder = 0,
    List<DistributionRuleRequest>? DistributionRules = null);

public record DistributionRuleRequest(
    ulong AccountId,
    string ValueMode,
    decimal? Percent,
    decimal? FixedAmount,
    string? Currency = null,
    int DelayDays = 0,
    ulong? CategoryId = null,
    List<string>? Tags = null,
    int SortOrder = 0);

public record IncomeGenerateRequest(
    string From,
    string To,
    bool Preview = true,
    decimal? ActualAmount = null,
    ulong? TrancheId = null);

public record ConfirmTrancheRequest(
    ulong TrancheId,
    string Month,
    decimal? ActualAmount = null);
