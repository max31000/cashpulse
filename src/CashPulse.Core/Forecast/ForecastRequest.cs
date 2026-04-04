using CashPulse.Core.Models;

namespace CashPulse.Core.Forecast;

public record ForecastRequest
{
    /// <summary>Current balances: [AccountId → [Currency → Amount]]</summary>
    public required Dictionary<long, Dictionary<string, decimal>> CurrentBalances { get; init; }

    /// <summary>All PlannedOperations (one-time + recurring templates with RecurrenceRule)</summary>
    public required List<PlannedOperation> PlannedOperations { get; init; }

    /// <summary>RecurrenceRules indexed by Id</summary>
    public required Dictionary<long, RecurrenceRule> RecurrenceRules { get; init; }

    /// <summary>Account metadata (type, credit params) indexed by Id</summary>
    public required Dictionary<long, Account> Accounts { get; init; }

    /// <summary>Scenarios indexed by Id</summary>
    public required Dictionary<long, Scenario> Scenarios { get; init; }

    /// <summary>Exchange rates: key = "USD_RUB", value = Rate</summary>
    public required Dictionary<string, decimal> ExchangeRates { get; init; }

    /// <summary>User's base currency</summary>
    public required string BaseCurrency { get; init; }

    /// <summary>Forecast horizon start (usually today UTC)</summary>
    public required DateOnly HorizonStart { get; init; }

    /// <summary>Forecast horizon end (HorizonStart + N months)</summary>
    public required DateOnly HorizonEnd { get; init; }
}
