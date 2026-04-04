using CashPulse.Core.Models;

namespace CashPulse.Core.Services;

public interface IExchangeRateService
{
    Task<IEnumerable<ExchangeRate>> GetAllRatesAsync();
    Task RefreshFromCbrAsync();
    Task<ExchangeRate?> GetRateAsync(string fromCurrency, string toCurrency);
}
