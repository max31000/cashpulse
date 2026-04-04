using CashPulse.Core.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CashPulse.Infrastructure.Services;

public class ExchangeRateRefreshService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ExchangeRateRefreshService> _logger;
    private readonly int _refreshIntervalHours;

    public ExchangeRateRefreshService(
        IServiceScopeFactory scopeFactory,
        ILogger<ExchangeRateRefreshService> logger,
        int refreshIntervalHours = 12)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _refreshIntervalHours = refreshIntervalHours;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial refresh on startup
        await RefreshRatesAsync();

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromHours(_refreshIntervalHours), stoppingToken);
            await RefreshRatesAsync();
        }
    }

    private async Task RefreshRatesAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IExchangeRateService>();
            await service.RefreshFromCbrAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing exchange rates");
        }
    }
}
