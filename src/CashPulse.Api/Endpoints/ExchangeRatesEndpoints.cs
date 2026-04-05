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
}
