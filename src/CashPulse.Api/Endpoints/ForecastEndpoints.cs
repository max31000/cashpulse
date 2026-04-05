using CashPulse.Core.Forecast;
using CashPulse.Core.Services;

namespace CashPulse.Api.Endpoints;

public static class ForecastEndpoints
{
    public static void MapForecastEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/forecast");
        group.MapGet("/", GetForecast);
    }

    private static async Task<IResult> GetForecast(
        HttpContext ctx,
        IForecastService forecastService,
        int horizonMonths = 6,
        bool includeScenarios = true)
    {
        var userId = (ulong)ctx.Items["UserId"]!;

        if (horizonMonths < 1 || horizonMonths > 24)
            throw new CashPulse.Api.Middleware.ValidationException("horizonMonths must be between 1 and 24");

        var result = await forecastService.BuildForecastAsync(userId, horizonMonths, includeScenarios);
        return Results.Ok(MapToForecastResponse(result));
    }

    /// <summary>
    /// Maps ForecastResult to the DTO structure expected by the frontend.
    /// timelines: Record&lt;string, TimelinePoint[]&gt; keyed by currency
    /// netWorth: NetWorthPoint[]
    /// alerts: ForecastAlert[]
    /// monthlyBreakdown: MonthlyBreakdown[]
    /// </summary>
    private static ForecastResponseDto MapToForecastResponse(ForecastResult result)
    {
        // Group AccountTimelines by currency and merge with forward-fill so that
        // every account contributes its last known balance on each date, not just
        // accounts that happen to have a point exactly on that date.
        var timelines = result.AccountTimelines
            .GroupBy(t => t.Currency)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var accountsInCurrency = g.ToList();

                    var allDates = accountsInCurrency
                        .SelectMany(t => t.Points.Select(p => p.Date))
                        .Distinct()
                        .OrderBy(d => d)
                        .ToList();

                    return allDates.Select(date =>
                    {
                        var totalBalance = accountsInCurrency.Sum(t =>
                            t.Points
                                .Where(p => p.Date <= date)
                                .OrderByDescending(p => p.Date)
                                .FirstOrDefault()?.Balance ?? 0m);

                        var isScenario = accountsInCurrency.Any(t =>
                            t.Points.Any(p => p.Date == date && p.IsScenario));

                        return new TimelinePointDto(
                            date.ToString("yyyy-MM-dd"),
                            totalBalance,
                            isScenario);
                    }).ToList();
                }
            );

        var netWorth = result.NetWorthTimeline
            .Select(p => new NetWorthPointDto(p.Date.ToString("yyyy-MM-dd"), p.Amount, p.Currency))
            .ToList();

        var alerts = result.Alerts
            .Select(a => new ForecastAlertDto(
                a.Type.ToString(),
                a.Severity.ToString().ToLower(),
                a.Date.ToString("yyyy-MM-dd"),
                a.AccountId,
                a.Message,
                a.SuggestedAction))
            .ToList();

        var monthlyBreakdown = result.MonthlyBreakdowns
            .Select(m => new MonthlyBreakdownDto(
                $"{m.Year:0000}-{m.Month:00}",
                m.Income,
                m.Expense,
                m.EndBalance,
                m.ByCategory
                    .Where(kv => kv.Key.HasValue)
                    .ToDictionary(kv => kv.Key!.Value, kv => kv.Value)))
            .ToList();

        return new ForecastResponseDto(timelines, netWorth, alerts, monthlyBreakdown);
    }
}

// DTOs matching the frontend TypeScript interfaces exactly
public record ForecastResponseDto(
    Dictionary<string, List<TimelinePointDto>> Timelines,
    List<NetWorthPointDto> NetWorth,
    List<ForecastAlertDto> Alerts,
    List<MonthlyBreakdownDto> MonthlyBreakdown);

public record TimelinePointDto(string Date, decimal Balance, bool IsScenario);

public record NetWorthPointDto(string Date, decimal Amount, string Currency);

public record ForecastAlertDto(
    string Type,
    string Severity,
    string Date,
    long? AccountId,
    string Message,
    string SuggestedAction);

public record MonthlyBreakdownDto(
    string Month,
    decimal Income,
    decimal Expense,
    decimal EndBalance,
    Dictionary<long, decimal> ByCategory);
