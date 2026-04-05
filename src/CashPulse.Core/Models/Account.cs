namespace CashPulse.Core.Models;

public class Account
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; }
    public decimal? CreditLimit { get; set; }
    public int? GracePeriodDays { get; set; }
    public decimal? MinPaymentPercent { get; set; }
    public int? StatementDay { get; set; }
    public int? DueDay { get; set; }

    // Deposits (Type = Deposit) and savings investment accounts (InvestmentSubtype = "savings")
    public decimal? InterestRate { get; set; }
    public int? InterestAccrualDay { get; set; }
    public DateOnly? DepositEndDate { get; set; }
    public bool? CanTopUpAlways { get; set; }
    public bool? CanWithdraw { get; set; }
    public bool? DailyAccrual { get; set; }

    // Investment accounts (Type = Investment)
    public string? InvestmentSubtype { get; set; }

    // Credit cards (Type = Credit)
    public DateOnly? GracePeriodEndDate { get; set; }

    public bool IsArchived { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Loaded separately
    public List<CurrencyBalance> Balances { get; set; } = new();
}

public enum AccountType
{
    Debit,
    Credit,
    Investment,
    Cash,
    Deposit
}
