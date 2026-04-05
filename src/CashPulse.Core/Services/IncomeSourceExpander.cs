using CashPulse.Core.Models;

namespace CashPulse.Core.Services;

public class PlannedOperationResult
{
    public ulong AccountId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public ulong? CategoryId { get; set; }
    public List<string> Tags { get; set; } = new();
    public DateOnly OperationDate { get; set; }
    public string? Description { get; set; }
    public ulong TrancheId { get; set; }
    public string TrancheName { get; set; } = string.Empty;
    public bool IsDuplicate { get; set; }
}

public class IncomeSourceExpander
{
    public List<PlannedOperationResult> Expand(
        IncomeSource source,
        DateOnly from,
        DateOnly to,
        decimal? actualAmount = null,
        ulong? trancheIdFilter = null,
        HashSet<string>? existingTags = null)
    {
        var result = new List<PlannedOperationResult>();
        var effectiveTotal = actualAmount ?? source.ExpectedTotal ?? 0m;

        var cursor = new DateOnly(from.Year, from.Month, 1);
        var endMonth = new DateOnly(to.Year, to.Month, 1);

        while (cursor <= endMonth)
        {
            foreach (var tranche in source.Tranches.OrderBy(t => t.SortOrder))
            {
                if (trancheIdFilter.HasValue && tranche.Id != trancheIdFilter.Value)
                    continue;

                var operationDate = ResolveDate(cursor.Year, cursor.Month, tranche.DayOfMonth);
                if (operationDate < from || operationDate > to)
                    continue;

                var trancheAmount = CalcTrancheAmount(tranche, effectiveTotal);
                decimal allocated = 0m;

                // Fixed → Percent → Remainder (порядок применения)
                var orderedRules = tranche.DistributionRules
                    .OrderBy(r => r.ValueMode == DistributionValueMode.Remainder ? 2
                                : r.ValueMode == DistributionValueMode.FixedAmount ? 0 : 1)
                    .ThenBy(r => r.SortOrder)
                    .ToList();

                foreach (var rule in orderedRules)
                {
                    var ruleAmount = rule.ValueMode switch
                    {
                        DistributionValueMode.FixedAmount => rule.FixedAmount ?? 0m,
                        DistributionValueMode.Percent     => Math.Round(trancheAmount * (rule.Percent ?? 0m) / 100m, 2, MidpointRounding.ToEven),
                        DistributionValueMode.Remainder   => Math.Round(trancheAmount - allocated, 2, MidpointRounding.ToEven),
                        _ => 0m
                    };

                    if (ruleAmount <= 0m) continue;

                    var finalDate = operationDate.AddDays(rule.DelayDays);
                    var tags = new List<string> { $"income-source:{source.Id}", $"tranche:{tranche.Id}" };
                    if (rule.Tags != null) tags.AddRange(rule.Tags);

                    var dedupeTag = $"income-source:{source.Id}:tranche:{tranche.Id}:{cursor.Year}-{cursor.Month:D2}:account:{rule.AccountId}";
                    var isDuplicate = existingTags?.Contains(dedupeTag) ?? false;

                    result.Add(new PlannedOperationResult
                    {
                        AccountId     = rule.AccountId,
                        Amount        = ruleAmount,
                        Currency      = rule.Currency ?? source.Currency,
                        CategoryId    = rule.CategoryId,
                        Tags          = tags,
                        OperationDate = finalDate,
                        Description   = $"{source.Name} · {tranche.Name}",
                        TrancheId     = tranche.Id,
                        TrancheName   = tranche.Name,
                        IsDuplicate   = isDuplicate
                    });

                    if (rule.ValueMode != DistributionValueMode.Remainder)
                        allocated += ruleAmount;
                }
            }
            cursor = cursor.AddMonths(1);
        }

        return result;
    }

    private static decimal CalcTrancheAmount(IncomeTranche t, decimal expectedTotal)
        => t.AmountMode switch
        {
            AmountMode.PercentOfTotal => Math.Round(expectedTotal * (t.PercentOfTotal ?? 0m) / 100m, 2, MidpointRounding.ToEven),
            AmountMode.Fixed or AmountMode.Estimated => t.FixedAmount ?? 0m,
            _ => 0m
        };

    private static DateOnly ResolveDate(int year, int month, int dayOfMonth)
    {
        if (dayOfMonth == -1)
            return new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        return new DateOnly(year, month, Math.Min(dayOfMonth, DateTime.DaysInMonth(year, month)));
    }
}
