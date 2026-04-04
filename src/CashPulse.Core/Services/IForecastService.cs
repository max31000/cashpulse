using CashPulse.Core.Forecast;

namespace CashPulse.Core.Services;

public interface IForecastService
{
    Task<ForecastResult> BuildForecastAsync(ulong userId, int horizonMonths, bool includeScenarios);
}
