using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class AccountsEndpoints
{
    public static void MapAccountsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/accounts");

        group.MapGet("/", GetAccounts);
        group.MapPost("/", CreateAccount);
        group.MapGet("/{id:long}", GetAccount);
        group.MapPut("/{id:long}", UpdateAccount);
        group.MapDelete("/{id:long}", ArchiveAccount);
        group.MapPut("/{id:long}/balances", UpdateBalances);
    }

    private static async Task<IResult> GetAccounts(HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);
        var accounts = await repo.GetByUserIdAsync(userId);
        return Results.Ok(accounts);
    }

    private static async Task<IResult> GetAccount(long id, HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);
        var account = await repo.GetByIdAsync((ulong)id, userId);
        if (account == null) throw new NotFoundException($"Account {id} not found");
        return Results.Ok(account);
    }

    private static async Task<IResult> CreateAccount(AccountCreateRequest req, HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);

        if (string.IsNullOrWhiteSpace(req.Name))
            throw new ValidationException("Name is required");

        var account = new Account
        {
            UserId = userId,
            Name = req.Name.Trim(),
            Type = Enum.Parse<AccountType>(req.Type, true),
            CreditLimit = req.CreditLimit,
            GracePeriodDays = req.GracePeriodDays,
            MinPaymentPercent = req.MinPaymentPercent,
            StatementDay = req.StatementDay,
            DueDay = req.DueDay,
            IsArchived = false,
            SortOrder = req.SortOrder,
            InterestRate = req.InterestRate,
            InterestAccrualDay = req.InterestAccrualDay,
            DepositEndDate = req.DepositEndDate,
            CanTopUpAlways = req.CanTopUpAlways,
            CanWithdraw = req.CanWithdraw,
            DailyAccrual = req.DailyAccrual,
            InvestmentSubtype = req.InvestmentSubtype,
            GracePeriodEndDate = req.GracePeriodEndDate
        };

        var id = await repo.CreateAsync(account);

        if (req.Balances?.Any() == true)
        {
            var balances = req.Balances.Select(b => new CurrencyBalance
            {
                AccountId = id,
                Currency = b.Currency,
                Amount = b.Amount
            });
            await repo.UpdateBalancesAsync(id, balances);
        }

        var created = await repo.GetByIdAsync(id, userId);
        return Results.Created($"/api/accounts/{id}", created);
    }

    private static async Task<IResult> UpdateAccount(long id, AccountUpdateRequest req, HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Account {id} not found");

        existing.Name = req.Name?.Trim() ?? existing.Name;
        if (req.Type != null) existing.Type = Enum.Parse<AccountType>(req.Type, true);
        existing.CreditLimit = req.CreditLimit ?? existing.CreditLimit;
        existing.GracePeriodDays = req.GracePeriodDays ?? existing.GracePeriodDays;
        existing.MinPaymentPercent = req.MinPaymentPercent ?? existing.MinPaymentPercent;
        existing.StatementDay = req.StatementDay ?? existing.StatementDay;
        existing.DueDay = req.DueDay ?? existing.DueDay;
        existing.SortOrder = req.SortOrder ?? existing.SortOrder;
        existing.InterestRate = req.InterestRate ?? existing.InterestRate;
        existing.InterestAccrualDay = req.InterestAccrualDay ?? existing.InterestAccrualDay;
        existing.DepositEndDate = req.DepositEndDate ?? existing.DepositEndDate;
        existing.CanTopUpAlways = req.CanTopUpAlways ?? existing.CanTopUpAlways;
        existing.CanWithdraw = req.CanWithdraw ?? existing.CanWithdraw;
        existing.DailyAccrual = req.DailyAccrual ?? existing.DailyAccrual;
        existing.InvestmentSubtype = req.InvestmentSubtype ?? existing.InvestmentSubtype;
        existing.GracePeriodEndDate = req.GracePeriodEndDate ?? existing.GracePeriodEndDate;

        await repo.UpdateAsync(existing);
        return Results.Ok(existing);
    }

    private static async Task<IResult> ArchiveAccount(long id, HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);
        var success = await repo.ArchiveAsync((ulong)id, userId);
        if (!success) throw new NotFoundException($"Account {id} not found");
        return Results.NoContent();
    }

    private static async Task<IResult> UpdateBalances(long id, List<BalanceUpdateItem> balances, HttpContext ctx, IAccountRepository repo)
    {
        var userId = GetUserId(ctx);
        var account = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Account {id} not found");

        var currencyBalances = balances.Select(b => new CurrencyBalance
        {
            AccountId = (ulong)id,
            Currency = b.Currency.ToUpper(),
            Amount = b.Amount
        });

        await repo.UpdateBalancesAsync((ulong)id, currencyBalances);
        var updated = await repo.GetByIdAsync((ulong)id, userId);
        return Results.Ok(updated);
    }

    private static ulong GetUserId(HttpContext ctx) => (ulong)ctx.Items["UserId"]!;
}

public record AccountCreateRequest(
    string Name,
    string Type,
    decimal? CreditLimit,
    int? GracePeriodDays,
    decimal? MinPaymentPercent,
    int? StatementDay,
    int? DueDay,
    int SortOrder = 0,
    List<BalanceUpdateItem>? Balances = null,
    decimal? InterestRate = null,
    int? InterestAccrualDay = null,
    DateOnly? DepositEndDate = null,
    bool? CanTopUpAlways = null,
    bool? CanWithdraw = null,
    bool? DailyAccrual = null,
    string? InvestmentSubtype = null,
    DateOnly? GracePeriodEndDate = null);

public record AccountUpdateRequest(
    string? Name,
    string? Type,
    decimal? CreditLimit,
    int? GracePeriodDays,
    decimal? MinPaymentPercent,
    int? StatementDay,
    int? DueDay,
    int? SortOrder,
    decimal? InterestRate = null,
    int? InterestAccrualDay = null,
    DateOnly? DepositEndDate = null,
    bool? CanTopUpAlways = null,
    bool? CanWithdraw = null,
    bool? DailyAccrual = null,
    string? InvestmentSubtype = null,
    DateOnly? GracePeriodEndDate = null);

public record BalanceUpdateItem(string Currency, decimal Amount);
