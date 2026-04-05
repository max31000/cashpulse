namespace CashPulse.Core.Models;

public enum AmountMode { Fixed = 0, PercentOfTotal = 1, Estimated = 2 }
public enum DistributionValueMode { Percent = 0, FixedAmount = 1, Remainder = 2 }

public class IncomeSource
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Currency { get; set; } = "RUB";
    public decimal? ExpectedTotal { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<IncomeTranche> Tranches { get; set; } = new();
}

public class IncomeTranche
{
    public ulong Id { get; set; }
    public ulong IncomeSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int DayOfMonth { get; set; }
    public AmountMode AmountMode { get; set; } = AmountMode.Fixed;
    public decimal? FixedAmount { get; set; }
    public decimal? PercentOfTotal { get; set; }
    public decimal? EstimatedMin { get; set; }
    public decimal? EstimatedMax { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<DistributionRule> DistributionRules { get; set; } = new();
}

public class DistributionRule
{
    public ulong Id { get; set; }
    public ulong TrancheId { get; set; }
    public ulong AccountId { get; set; }
    public string? Currency { get; set; }
    public DistributionValueMode ValueMode { get; set; } = DistributionValueMode.Remainder;
    public decimal? Percent { get; set; }
    public decimal? FixedAmount { get; set; }
    public int DelayDays { get; set; }
    public ulong? CategoryId { get; set; }
    public List<string>? Tags { get; set; }
    public int SortOrder { get; set; }
}
