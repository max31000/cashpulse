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

        // Вспомогательная функция — читает connectionString лениво при первом resolve,
        // чтобы WebApplicationFactory.ConfigureWebHost успела подменить конфигурацию
        // до того как репозитории впервые создадутся.
        static string GetConnStr(IServiceProvider sp) =>
            sp.GetRequiredService<IConfiguration>()
              .GetConnectionString("DefaultConnection")
              ?? throw new InvalidOperationException("DefaultConnection string is not configured");

        // Repositories
        services.AddScoped<IUserRepository>(sp => new UserRepository(GetConnStr(sp)));
        services.AddScoped<IAccountRepository>(sp => new AccountRepository(GetConnStr(sp)));
        services.AddScoped<IOperationRepository>(sp => new OperationRepository(GetConnStr(sp)));
        services.AddScoped<ICategoryRepository>(sp => new CategoryRepository(GetConnStr(sp)));
        services.AddScoped<IScenarioRepository>(sp => new ScenarioRepository(GetConnStr(sp)));
        services.AddScoped<IExchangeRateRepository>(sp => new ExchangeRateRepository(GetConnStr(sp)));
        services.AddScoped<IBalanceSnapshotRepository>(sp => new BalanceSnapshotRepository(GetConnStr(sp)));
        services.AddScoped<ICsvImportRepository>(sp => new CsvImportRepository(GetConnStr(sp)));

        // Auth services
        services.AddScoped<ITelegramAuthService, TelegramAuthService>();

        // Income sources
        services.AddScoped<IIncomeSourceRepository>(sp => new IncomeSourceRepository(GetConnStr(sp)));
        services.AddTransient<IncomeSourceExpander>();

        // Domain services
        services.AddTransient<ForecastEngine>();

        services.AddScoped<IForecastService>(sp => new ForecastService(
            sp.GetRequiredService<IAccountRepository>(),
            sp.GetRequiredService<IOperationRepository>(),
            sp.GetRequiredService<IScenarioRepository>(),
            sp.GetRequiredService<IExchangeRateRepository>(),
            sp.GetRequiredService<ForecastEngine>(),
            GetConnStr(sp)));

        services.AddScoped<IExchangeRateService>(sp => new ExchangeRateService(
            GetConnStr(sp),
            sp.GetRequiredService<IExchangeRateRepository>(),
            sp.GetRequiredService<ILogger<ExchangeRateService>>(),
            sp.GetRequiredService<IConfiguration>()["ExchangeRates:CbrXmlUrl"]
                ?? "https://www.cbr.ru/scripts/XML_daily.asp"));

        // Background service for exchange rates
        services.AddSingleton<ExchangeRateRefreshService>(sp => new ExchangeRateRefreshService(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<ILogger<ExchangeRateRefreshService>>(),
            int.Parse(sp.GetRequiredService<IConfiguration>()["ExchangeRates:RefreshIntervalHours"] ?? "12")));
        services.AddHostedService(sp => sp.GetRequiredService<ExchangeRateRefreshService>());

        // Migration runner
        services.AddSingleton(sp => new MigrationRunner(
            GetConnStr(sp),
            sp.GetRequiredService<ILogger<MigrationRunner>>()));

        return services;
    }
}
