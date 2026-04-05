using CashPulse.Core.Models;

namespace CashPulse.IntegrationTests.Infrastructure.TestBuilders;

/// <summary>
/// Fluent builder for Account model, matching Account.cs fields.
/// </summary>
public class AccountBuilder
{
    private ulong _id = 0;
    private ulong _userId = 1;
    private string _name = "Test Account";
    private AccountType _type = AccountType.Debit;
    private decimal? _creditLimit = null;
    private int? _gracePeriodDays = null;
    private decimal? _minPaymentPercent = null;
    private int? _statementDay = null;
    private int? _dueDay = null;
    private decimal? _interestRate = null;
    private int? _interestAccrualDay = null;
    private DateOnly? _depositEndDate = null;
    private bool? _canTopUpAlways = null;
    private bool? _canWithdraw = null;
    private bool? _dailyAccrual = null;
    private string? _investmentSubtype = null;
    private DateOnly? _gracePeriodEndDate = null;
    private bool _isArchived = false;
    private int _sortOrder = 0;
    private List<CurrencyBalance> _balances = new();

    public AccountBuilder WithId(ulong id) { _id = id; return this; }
    public AccountBuilder WithUserId(ulong userId) { _userId = userId; return this; }
    public AccountBuilder WithName(string name) { _name = name; return this; }
    public AccountBuilder WithType(AccountType type) { _type = type; return this; }
    public AccountBuilder WithCreditLimit(decimal? limit) { _creditLimit = limit; return this; }
    public AccountBuilder WithGracePeriodDays(int? days) { _gracePeriodDays = days; return this; }
    public AccountBuilder WithMinPaymentPercent(decimal? pct) { _minPaymentPercent = pct; return this; }
    public AccountBuilder WithStatementDay(int? day) { _statementDay = day; return this; }
    public AccountBuilder WithDueDay(int? day) { _dueDay = day; return this; }
    public AccountBuilder WithInterestRate(decimal? rate) { _interestRate = rate; return this; }
    public AccountBuilder WithInterestAccrualDay(int? day) { _interestAccrualDay = day; return this; }
    public AccountBuilder WithDepositEndDate(DateOnly? date) { _depositEndDate = date; return this; }
    public AccountBuilder WithCanTopUpAlways(bool? v) { _canTopUpAlways = v; return this; }
    public AccountBuilder WithCanWithdraw(bool? v) { _canWithdraw = v; return this; }
    public AccountBuilder WithDailyAccrual(bool? v) { _dailyAccrual = v; return this; }
    public AccountBuilder WithInvestmentSubtype(string? subtype) { _investmentSubtype = subtype; return this; }
    public AccountBuilder WithGracePeriodEndDate(DateOnly? date) { _gracePeriodEndDate = date; return this; }
    public AccountBuilder IsArchived(bool archived = true) { _isArchived = archived; return this; }
    public AccountBuilder WithSortOrder(int order) { _sortOrder = order; return this; }
    public AccountBuilder WithBalance(string currency, decimal amount)
    {
        _balances.Add(new CurrencyBalance { Currency = currency, Amount = amount });
        return this;
    }

    public Account Build() => new Account
    {
        Id = _id,
        UserId = _userId,
        Name = _name,
        Type = _type,
        CreditLimit = _creditLimit,
        GracePeriodDays = _gracePeriodDays,
        MinPaymentPercent = _minPaymentPercent,
        StatementDay = _statementDay,
        DueDay = _dueDay,
        InterestRate = _interestRate,
        InterestAccrualDay = _interestAccrualDay,
        DepositEndDate = _depositEndDate,
        CanTopUpAlways = _canTopUpAlways,
        CanWithdraw = _canWithdraw,
        DailyAccrual = _dailyAccrual,
        InvestmentSubtype = _investmentSubtype,
        GracePeriodEndDate = _gracePeriodEndDate,
        IsArchived = _isArchived,
        SortOrder = _sortOrder,
        Balances = _balances,
    };
}
