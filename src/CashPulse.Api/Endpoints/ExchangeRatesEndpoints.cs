using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using CashPulse.Core.Services;

namespace CashPulse.Api.Endpoints;

public static class ExchangeRatesEndpoints
{
    public static void MapExchangeRatesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/exchange-rates");

        group.MapGet("/", GetRates);
        group.MapPost("/refresh", RefreshRates);
        group.MapPut("/", UpdateRate);
    }

    private static async Task<IResult> GetRates(IExchangeRateRepository repo)
    {
        var rates = await repo.GetAllAsync();
        return Results.Ok(rates);
    }

    private static async Task<IResult> RefreshRates(IExchangeRateService service)
    {
        await service.RefreshFromCbrAsync();
        var rates = await service.GetAllRatesAsync();
        return Results.Ok(new { message = "Exchange rates refreshed", rates });
    }

    private static async Task<IResult> UpdateRate(ExchangeRateUpdateRequest req, IExchangeRateRepository repo)
    {
        if (req.Rate <= 0)
            throw new CashPulse.Api.Middleware.ValidationException("Rate must be positive");

        var rate = new ExchangeRate
        {
            FromCurrency = req.FromCurrency.ToUpper(),
            ToCurrency = req.ToCurrency.ToUpper(),
            Rate = req.Rate
        };

        await repo.UpsertAsync(rate);

        // Update inverse rate
        var inverseRate = new ExchangeRate
        {
            FromCurrency = req.ToCurrency.ToUpper(),
            ToCurrency = req.FromCurrency.ToUpper(),
            Rate = 1m / req.Rate
        };
        await repo.UpsertAsync(inverseRate);

        return Results.Ok(rate);
    }
}

public record ExchangeRateUpdateRequest(string FromCurrency, string ToCurrency, decimal Rate);
