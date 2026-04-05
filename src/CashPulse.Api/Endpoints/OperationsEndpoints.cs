using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class OperationsEndpoints
{
    public static void MapOperationsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/operations");

        group.MapGet("/", GetOperations);
        group.MapGet("/recurring", GetRecurringOperations);
        group.MapGet("/{id:long}", GetOperation);
        group.MapPost("/", CreateOperation);
        group.MapPut("/{id:long}", UpdateOperation);
        group.MapDelete("/{id:long}", DeleteOperation);
        group.MapPost("/{id:long}/confirm", ConfirmOperation);
    }

    private static async Task<IResult> GetOperations(
        HttpContext ctx,
        IOperationRepository repo,
        DateOnly? from = null,
        DateOnly? to = null,
        long? accountId = null,
        long? categoryId = null,
        string? tag = null,
        bool? isConfirmed = null,
        long? scenarioId = null,
        int offset = 0,
        int limit = 50)
    {
        var userId = GetUserId(ctx);
        var filter = new OperationFilter
        {
            From = from,
            To = to,
            AccountId = accountId.HasValue ? (ulong)accountId.Value : null,
            CategoryId = categoryId.HasValue ? (ulong)categoryId.Value : null,
            Tag = tag,
            IsConfirmed = isConfirmed,
            ScenarioId = scenarioId.HasValue ? (ulong)scenarioId.Value : null,
            Offset = offset,
            Limit = Math.Min(limit, 500)
        };

        var ops = await repo.GetByUserIdAsync(userId, filter);
        return Results.Ok(ops);
    }

    private static async Task<IResult> GetRecurringOperations(HttpContext ctx, IOperationRepository repo)
    {
        var userId = GetUserId(ctx);
        var ops = await repo.GetRecurringAsync(userId);
        return Results.Ok(ops);
    }

    private static async Task<IResult> GetOperation(long id, HttpContext ctx, IOperationRepository repo)
    {
        var userId = GetUserId(ctx);
        var op = await repo.GetByIdAsync((ulong)id, userId);
        if (op == null) throw new NotFoundException($"Operation {id} not found");
        return Results.Ok(op);
    }

    private static async Task<IResult> CreateOperation(
        OperationCreateRequest req,
        HttpContext ctx,
        IOperationRepository repo,
        IAccountRepository accountRepo)
    {
        var userId = GetUserId(ctx);

        var account = await accountRepo.GetByIdAsync((ulong)req.AccountId, userId)
            ?? throw new NotFoundException($"Account {req.AccountId} not found");

        if (req.Amount == 0)
            throw new ValidationException("Amount cannot be zero");
        if (string.IsNullOrWhiteSpace(req.Currency))
            throw new ValidationException("Currency is required");
        if (req.OperationDate == null && req.RecurrenceRule == null)
            throw new ValidationException("Either OperationDate or RecurrenceRule must be provided");
        if (req.OperationDate != null && req.RecurrenceRule != null)
            throw new ValidationException("Cannot provide both OperationDate and RecurrenceRule");

        ulong? recurrenceRuleId = null;
        if (req.RecurrenceRule != null)
        {
            var rule = MapToRecurrenceRule(req.RecurrenceRule);
            recurrenceRuleId = await repo.CreateRecurrenceRuleAsync(rule);
        }

        var shouldConfirm = req.IsConfirmed ??
            (req.OperationDate == null || req.OperationDate <= DateOnly.FromDateTime(DateTime.Today));

        var op = new PlannedOperation
        {
            UserId = userId,
            AccountId = (ulong)req.AccountId,
            Amount = req.Amount,
            Currency = req.Currency.ToUpper(),
            CategoryId = req.CategoryId.HasValue ? (ulong)req.CategoryId.Value : null,
            Tags = req.Tags?.Select(t => t.Trim().ToLower()).Where(t => !string.IsNullOrEmpty(t)).ToList(),
            Description = req.Description?.Trim(),
            OperationDate = req.OperationDate,
            RecurrenceRuleId = recurrenceRuleId,
            IsConfirmed = shouldConfirm,
            ScenarioId = req.ScenarioId.HasValue ? (ulong)req.ScenarioId.Value : null
        };

        var id = await repo.CreateAsync(op);

        if (shouldConfirm)
        {
            var balances = (await accountRepo.GetBalancesAsync((ulong)req.AccountId)).ToList();
            var entry = balances.FirstOrDefault(b =>
                string.Equals(b.Currency, req.Currency.ToUpper(), StringComparison.OrdinalIgnoreCase));
            if (entry != null)
                entry.Amount += req.Amount;
            else
                balances.Add(new CurrencyBalance
                {
                    AccountId = (ulong)req.AccountId,
                    Currency = req.Currency.ToUpper(),
                    Amount = req.Amount
                });
            await accountRepo.UpdateBalancesAsync((ulong)req.AccountId, balances);
        }

        var created = await repo.GetByIdAsync(id, userId);
        return Results.Created($"/api/operations/{id}", created);
    }

    private static async Task<IResult> UpdateOperation(
        long id,
        OperationUpdateRequest req,
        HttpContext ctx,
        IOperationRepository repo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Operation {id} not found");

        if (req.Amount.HasValue) existing.Amount = req.Amount.Value;
        if (req.Currency != null) existing.Currency = req.Currency.ToUpper();
        if (req.CategoryId.HasValue) existing.CategoryId = (ulong)req.CategoryId.Value;
        if (req.Tags != null) existing.Tags = req.Tags.Select(t => t.Trim().ToLower()).ToList();
        if (req.Description != null) existing.Description = req.Description.Trim();
        if (req.OperationDate.HasValue) existing.OperationDate = req.OperationDate.Value;
        if (req.ScenarioId.HasValue) existing.ScenarioId = (ulong)req.ScenarioId.Value;

        await repo.UpdateAsync(existing);
        return Results.Ok(existing);
    }

    private static async Task<IResult> DeleteOperation(
        long id,
        HttpContext ctx,
        IOperationRepository repo,
        IAccountRepository accountRepo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Operation {id} not found");

        if (existing.IsConfirmed)
        {
            var balances = (await accountRepo.GetBalancesAsync(existing.AccountId)).ToList();
            var entry = balances.FirstOrDefault(b =>
                string.Equals(b.Currency, existing.Currency, StringComparison.OrdinalIgnoreCase));
            if (entry != null)
            {
                entry.Amount -= existing.Amount;
                await accountRepo.UpdateBalancesAsync(existing.AccountId, balances);
            }
        }

        await repo.DeleteAsync((ulong)id, userId);
        return Results.NoContent();
    }

    private static async Task<IResult> ConfirmOperation(
        long id,
        HttpContext ctx,
        IOperationRepository repo,
        IAccountRepository accountRepo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Operation {id} not found");

        if (existing.IsConfirmed)
            return Results.Ok(new { id, isConfirmed = true });

        await repo.ConfirmAsync((ulong)id, userId);

        var balances = (await accountRepo.GetBalancesAsync(existing.AccountId)).ToList();
        var entry = balances.FirstOrDefault(b =>
            string.Equals(b.Currency, existing.Currency, StringComparison.OrdinalIgnoreCase));

        if (entry != null)
        {
            entry.Amount += existing.Amount;
        }
        else
        {
            balances.Add(new CurrencyBalance
            {
                AccountId = existing.AccountId,
                Currency = existing.Currency,
                Amount = existing.Amount
            });
        }

        await accountRepo.UpdateBalancesAsync(existing.AccountId, balances);

        return Results.Ok(new { id, isConfirmed = true });
    }

    private static RecurrenceRule MapToRecurrenceRule(RecurrenceRuleRequest req)
    {
        return new RecurrenceRule
        {
            Type = Enum.Parse<RecurrenceType>(req.Type, true),
            DayOfMonth = req.DayOfMonth,
            Interval = req.Interval,
            DaysOfWeek = req.DaysOfWeek,
            StartDate = req.StartDate,
            EndDate = req.EndDate
        };
    }

    private static ulong GetUserId(HttpContext ctx) => (ulong)ctx.Items["UserId"]!;
}

public record OperationCreateRequest(
    long AccountId,
    decimal Amount,
    string Currency,
    long? CategoryId,
    List<string>? Tags,
    string? Description,
    DateOnly? OperationDate,
    RecurrenceRuleRequest? RecurrenceRule,
    long? ScenarioId,
    bool? IsConfirmed);

public record OperationUpdateRequest(
    decimal? Amount,
    string? Currency,
    long? CategoryId,
    List<string>? Tags,
    string? Description,
    DateOnly? OperationDate,
    long? ScenarioId);

public record RecurrenceRuleRequest(
    string Type,
    int? DayOfMonth,
    int? Interval,
    List<int>? DaysOfWeek,
    DateOnly StartDate,
    DateOnly? EndDate);
