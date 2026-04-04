using CashPulse.Core.Models;

namespace CashPulse.Core.Interfaces.Repositories;

public interface IExchangeRateRepository
{
    Task<IEnumerable<ExchangeRate>> GetAllAsync();
    Task<ExchangeRate?> GetByPairAsync(string fromCurrency, string toCurrency);
    Task UpsertAsync(ExchangeRate rate);
    Task UpsertManyAsync(IEnumerable<ExchangeRate> rates);
}
