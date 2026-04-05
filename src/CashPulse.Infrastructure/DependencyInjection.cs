using CashPulse.Core.Forecast;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Services;
using CashPulse.Infrastructure.Repositories;
using CashPulse.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

// Регистрация IConfiguration как scoped-зависимости для TelegramAuthService
// (IConfiguration уже является singleton, но нам нужно резолвить его через DI)

namespace CashPulse.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Регистрируем TypeHandler'ы Dapper один раз при старте
        DapperTypeHandlers.Register();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("DefaultConnection string is not configured");

        // Repositories
        services.AddScoped<IUserRepository>(_ => new UserRepository(connectionString));
        services.AddScoped<IAccountRepository>(_ => new AccountRepository(connectionString));
        services.AddScoped<IOperationRepository>(_ => new OperationRepository(connectionString));
        services.AddScoped<ICategoryRepository>(_ => new CategoryRepository(connectionString));
        services.AddScoped<IScenarioRepository>(_ => new ScenarioRepository(connectionString));
        services.AddScoped<IExchangeRateRepository>(_ => new ExchangeRateRepository(connectionString));
        services.AddScoped<IBalanceSnapshotRepository>(_ => new BalanceSnapshotRepository(connectionString));
        services.AddScoped<ICsvImportRepository>(_ => new CsvImportRepository(connectionString));

        // Auth services (IConfiguration резолвится из DI контейнера — он зарегистрирован как singleton)
        services.AddScoped<ITelegramAuthService, TelegramAuthService>();

        // Domain services
        services.AddTransient<ForecastEngine>();

        services.AddScoped<IForecastService>(sp => new ForecastService(
            sp.GetRequiredService<IAccountRepository>(),
            sp.GetRequiredService<IOperationRepository>(),
            sp.GetRequiredService<IScenarioRepository>(),
            sp.GetRequiredService<IExchangeRateRepository>(),
            sp.GetRequiredService<ForecastEngine>(),
            connectionString));

        services.AddScoped<IExchangeRateService>(sp => new ExchangeRateService(
            connectionString,
            sp.GetRequiredService<IExchangeRateRepository>(),
            sp.GetRequiredService<ILogger<ExchangeRateService>>(),
            configuration["ExchangeRates:CbrXmlUrl"] ?? "https://www.cbr.ru/scripts/XML_daily.asp"));

        // Background service for exchange rates
        var refreshIntervalHours = int.Parse(configuration["ExchangeRates:RefreshIntervalHours"] ?? "12");
        services.AddSingleton<ExchangeRateRefreshService>(sp => new ExchangeRateRefreshService(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<ILogger<ExchangeRateRefreshService>>(),
            refreshIntervalHours));
        services.AddHostedService(sp => sp.GetRequiredService<ExchangeRateRefreshService>());

        // Migration runner
        services.AddSingleton(sp => new MigrationRunner(
            connectionString,
            sp.GetRequiredService<ILogger<MigrationRunner>>()));

        return services;
    }
}
