using CashPulse.Api.Auth;
using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class BalanceSnapshotsEndpoints
{
    public static void MapBalanceSnapshotsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/balance-snapshots");

        group.MapPost("/", CreateSnapshot);
        group.MapGet("/", GetSnapshots);
    }

    private static async Task<IResult> CreateSnapshot(
        SnapshotCreateRequest req,
        ICurrentUser currentUser,
        IBalanceSnapshotRepository snapshotRepo,
        IAccountRepository accountRepo)
    {
        var userId = await currentUser.GetIdAsync();

        var account = await accountRepo.GetByIdAsync((ulong)req.AccountId, userId)
            ?? throw new NotFoundException($"Account {req.AccountId} not found");

        var snapshot = new BalanceSnapshot
        {
            AccountId = (ulong)req.AccountId,
            Currency = req.Currency.ToUpper(),
            Amount = req.Amount,
            SnapshotDate = req.SnapshotDate,
            Note = req.Note?.Trim()
        };

        var id = await snapshotRepo.CreateAsync(snapshot);

        // Also update CurrencyBalances with the new snapshot value
        var currentBalances = (await accountRepo.GetBalancesAsync((ulong)req.AccountId)).ToList();
        var existingCurrency = currentBalances.FirstOrDefault(b => b.Currency == req.Currency.ToUpper());
        if (existingCurrency != null)
            existingCurrency.Amount = req.Amount;
        else
            currentBalances.Add(new CurrencyBalance
            {
                AccountId = (ulong)req.AccountId,
                Currency = req.Currency.ToUpper(),
                Amount = req.Amount
            });

        await accountRepo.UpdateBalancesAsync((ulong)req.AccountId, currentBalances);

        snapshot.Id = id;
        return Results.Created($"/api/balance-snapshots/{id}", snapshot);
    }

    private static async Task<IResult> GetSnapshots(
        ICurrentUser currentUser,
        IBalanceSnapshotRepository snapshotRepo,
        IAccountRepository accountRepo,
        long? accountId = null)
    {
        var userId = await currentUser.GetIdAsync();

        if (accountId.HasValue)
        {
            var account = await accountRepo.GetByIdAsync((ulong)accountId.Value, userId)
                ?? throw new NotFoundException($"Account {accountId} not found");

            var snapshots = await snapshotRepo.GetByAccountIdAsync((ulong)accountId.Value);
            return Results.Ok(snapshots);
        }

        // Get all accounts for user and their snapshots
        var accounts = await accountRepo.GetByUserIdAsync(userId);
        var allSnapshots = new List<BalanceSnapshot>();
        foreach (var acc in accounts)
        {
            var snaps = await snapshotRepo.GetByAccountIdAsync(acc.Id);
            allSnapshots.AddRange(snaps);
        }

        return Results.Ok(allSnapshots.OrderByDescending(s => s.SnapshotDate).ThenByDescending(s => s.CreatedAt));
    }

}

public record SnapshotCreateRequest(
    long AccountId,
    string Currency,
    decimal Amount,
    DateOnly SnapshotDate,
    string? Note);
