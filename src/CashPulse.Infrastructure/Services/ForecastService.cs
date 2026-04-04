using CashPulse.Core.Forecast;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using CashPulse.Core.Services;
using Dapper;
using MySqlConnector;

namespace CashPulse.Infrastructure.Services;

public class ForecastService : IForecastService
{
    private readonly IAccountRepository _accountRepo;
    private readonly IOperationRepository _operationRepo;
    private readonly IScenarioRepository _scenarioRepo;
    private readonly IExchangeRateRepository _rateRepo;
    private readonly ForecastEngine _engine;
    private readonly string _connectionString;

    public ForecastService(
        IAccountRepository accountRepo,
        IOperationRepository operationRepo,
        IScenarioRepository scenarioRepo,
        IExchangeRateRepository rateRepo,
        ForecastEngine engine,
        string connectionString)
    {
        _accountRepo = accountRepo;
        _operationRepo = operationRepo;
        _scenarioRepo = scenarioRepo;
        _rateRepo = rateRepo;
        _engine = engine;
        _connectionString = connectionString;
    }

    public async Task<ForecastResult> BuildForecastAsync(ulong userId, int horizonMonths, bool includeScenarios)
    {
        // 1. Load accounts (not archived)
        var accounts = (await _accountRepo.GetByUserIdAsync(userId)).ToList();

        // 2. Build current balances dict: [AccountId → [Currency → Amount]]
        var currentBalances = new Dictionary<long, Dictionary<string, decimal>>();
        foreach (var account in accounts)
        {
            var balancesDict = account.Balances.ToDictionary(
                b => b.Currency,
                b => b.Amount);
            currentBalances[(long)account.Id] = balancesDict;
        }

        // 3. Load all operations for forecast
        var operations = (await _operationRepo.GetAllForForecastAsync(userId)).ToList();

        // 4. Build recurrence rules dict
        var recurrenceRules = new Dictionary<long, RecurrenceRule>();
        foreach (var op in operations.Where(o => o.RecurrenceRule != null))
        {
            var ruleId = (long)op.RecurrenceRuleId!.Value;
            if (!recurrenceRules.ContainsKey(ruleId))
                recurrenceRules[ruleId] = op.RecurrenceRule!;
        }

        // 5. If not including scenarios, filter operations from inactive scenarios
        var scenarios = new Dictionary<long, Scenario>();
        if (includeScenarios)
        {
            var scenarioList = await _scenarioRepo.GetByUserIdAsync(userId);
            foreach (var s in scenarioList)
                scenarios[(long)s.Id] = s;
        }
        else
        {
            // Remove all scenario operations
            operations = operations.Where(o => !o.ScenarioId.HasValue).ToList();
        }

        // 6. Load exchange rates
        var rates = await _rateRepo.GetAllAsync();
        var ratesDict = rates.ToDictionary(
            r => $"{r.FromCurrency}_{r.ToCurrency}",
            r => r.Rate);

        // 7. Get user's base currency
        var baseCurrency = await GetUserBaseCurrencyAsync(userId);

        // 8. Build horizon
        var horizonStart = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var horizonEnd = horizonStart.AddMonths(horizonMonths);

        // 9. Build account metadata dict
        var accountsDict = accounts.ToDictionary(a => (long)a.Id);

        // 10. Assemble request
        var request = new ForecastRequest
        {
            CurrentBalances = currentBalances,
            PlannedOperations = operations,
            RecurrenceRules = recurrenceRules,
            Accounts = accountsDict,
            Scenarios = scenarios,
            ExchangeRates = ratesDict,
            BaseCurrency = baseCurrency,
            HorizonStart = horizonStart,
            HorizonEnd = horizonEnd
        };

        // 11. Calculate
        return _engine.Calculate(request);
    }

    private async Task<string> GetUserBaseCurrencyAsync(ulong userId)
    {
        await using var conn = new MySqlConnection(_connectionString);
        var currency = await conn.QueryFirstOrDefaultAsync<string>(
            "SELECT BaseCurrency FROM Users WHERE Id = @UserId",
            new { UserId = userId });
        return currency ?? "RUB";
    }
}
