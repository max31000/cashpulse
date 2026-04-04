using System.Globalization;
using System.Xml.Linq;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using CashPulse.Core.Services;
using Microsoft.Extensions.Logging;

namespace CashPulse.Infrastructure.Services;

public class ExchangeRateService : IExchangeRateService
{
    private readonly string _connectionString;
    private readonly IExchangeRateRepository _repository;
    private readonly ILogger<ExchangeRateService> _logger;
    private readonly string _cbrXmlUrl;
    private static readonly HttpClient _httpClient = new();

    public ExchangeRateService(
        string connectionString,
        IExchangeRateRepository repository,
        ILogger<ExchangeRateService> logger,
        string cbrXmlUrl)
    {
        _connectionString = connectionString;
        _repository = repository;
        _logger = logger;
        _cbrXmlUrl = cbrXmlUrl;
    }

    public async Task<IEnumerable<ExchangeRate>> GetAllRatesAsync()
    {
        return await _repository.GetAllAsync();
    }

    public async Task<ExchangeRate?> GetRateAsync(string fromCurrency, string toCurrency)
    {
        return await _repository.GetByPairAsync(fromCurrency, toCurrency);
    }

    public async Task RefreshFromCbrAsync()
    {
        try
        {
            _logger.LogInformation("Refreshing exchange rates from CBR...");

            var xml = await _httpClient.GetStringAsync(_cbrXmlUrl);
            var rates = ParseCbrXml(xml);

            if (rates.Any())
            {
                await _repository.UpsertManyAsync(rates);
                _logger.LogInformation("Exchange rates updated: {Count} pairs", rates.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh exchange rates from CBR, using cached values");
            // Fallback: do nothing, keep existing rates in DB
        }
    }

    private List<ExchangeRate> ParseCbrXml(string xml)
    {
        var rates = new List<ExchangeRate>();

        try
        {
            var doc = XDocument.Parse(xml);
            var valuteList = doc.Descendants("Valute");

            decimal usdToRub = 0;
            decimal eurToRub = 0;

            foreach (var valute in valuteList)
            {
                var charCode = valute.Element("CharCode")?.Value?.Trim();
                var valueStr = valute.Element("Value")?.Value?.Trim()?.Replace(',', '.');
                var nominalStr = valute.Element("Nominal")?.Value?.Trim();

                if (string.IsNullOrEmpty(charCode) || string.IsNullOrEmpty(valueStr))
                    continue;

                if (!decimal.TryParse(valueStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var value))
                    continue;

                if (!int.TryParse(nominalStr, out var nominal) || nominal <= 0)
                    nominal = 1;

                var rateToRub = value / nominal;

                if (charCode == "USD")
                {
                    usdToRub = rateToRub;
                    rates.Add(new ExchangeRate { FromCurrency = "USD", ToCurrency = "RUB", Rate = rateToRub });
                    if (rateToRub > 0)
                        rates.Add(new ExchangeRate { FromCurrency = "RUB", ToCurrency = "USD", Rate = 1m / rateToRub });
                }
                else if (charCode == "EUR")
                {
                    eurToRub = rateToRub;
                    rates.Add(new ExchangeRate { FromCurrency = "EUR", ToCurrency = "RUB", Rate = rateToRub });
                    if (rateToRub > 0)
                        rates.Add(new ExchangeRate { FromCurrency = "RUB", ToCurrency = "EUR", Rate = 1m / rateToRub });
                }
            }

            // Always include RUB→RUB = 1
            rates.Add(new ExchangeRate { FromCurrency = "RUB", ToCurrency = "RUB", Rate = 1m });

            // Cross rates USD↔EUR
            if (usdToRub > 0 && eurToRub > 0)
            {
                rates.Add(new ExchangeRate { FromCurrency = "USD", ToCurrency = "EUR", Rate = usdToRub / eurToRub });
                rates.Add(new ExchangeRate { FromCurrency = "EUR", ToCurrency = "USD", Rate = eurToRub / usdToRub });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse CBR XML response");
        }

        return rates;
    }
}
