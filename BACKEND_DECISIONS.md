# BACKEND_DECISIONS.md — CashPulse

Зафиксировано: 2026-04-05
Версия: 1.0

---

## Решение 1: Swashbuckle вместо Microsoft.AspNetCore.Authentication.JwtBearer

**Инструкция указывала:** `Microsoft.AspNetCore.Authentication.JwtBearer` в зависимостях CashPulse.Api.

**Решение:** Заменён на `Swashbuckle.AspNetCore` (Swagger UI), поскольку JWT-аутентификация явно исключена из MVP (UserId=1 хардкоден), а Swagger нужен для документации и тестирования API.

---

## Решение 2: EmbeddedResource для SQL-миграций

**Инструкция указывала:** MigrationRunner считывает файлы из папки `Migrations/`.

**Решение:** SQL-файлы встраиваются как `EmbeddedResource` в сборку `CashPulse.Infrastructure.dll`. Это необходимо для корректной работы в Docker (файлы недоступны на хосте). MigrationRunner читает их через `Assembly.GetManifestResourceStream()`.

---

## Решение 3: ForecastService получает connectionString через конструктор

**Инструкция указывала:** `ForecastService` как стандартный DI-сервис.

**Решение:** `ForecastService` создаётся через фабричный лямбда-метод в `DependencyInjection.cs`, т.к. он принимает `connectionString: string` — не зарегистрированный DI-тип. Параметр нужен для прямого запроса `BaseCurrency` из таблицы Users.

---

## Решение 4: Добавлен метод GetAllForForecastAsync в IOperationRepository

**Инструкция:** `IOperationRepository` содержит `GetRecurringAsync`.

**Решение:** Добавлен `GetAllForForecastAsync(userId)` — возвращает все операции (разовые + повторяющиеся) с загрузкой RecurrenceRule. Метод используется ForecastService для построения полного прогноза. Без него ForecastService был бы неполным.

---

## Решение 5: ExchangeRateRefreshService регистрируется как HostedService через IHostedService

**Инструкция:** `BackgroundService` для обновления курсов.

**Решение:** `ExchangeRateRefreshService` зарегистрирован как `Singleton` + `AddHostedService`. Первичное обновление происходит при старте сервиса (не при запуске приложения), чтобы не блокировать запуск.

---

## Решение 6: Дополнительный параметр Scenarios в ForecastRequest

**Инструкция:** Spec FORECAST_ENGINE.md ссылается на `request.Scenarios[op.ScenarioId]` без явного поля.

**Решение:** В `ForecastRequest` добавлено поле `public required Dictionary<long, Scenario> Scenarios { get; init; }`. Это необходимо для фильтрации операций из неактивных сценариев без дополнительных запросов к БД.

---

## Решение 7: TagsEndpoints использует горизонт 1 месяц

**Инструкция:** `GET /api/tags/summary` должен агрегировать теги.

**Решение:** Endpoint делегирует вызов `IForecastService.BuildForecastAsync(userId, horizonMonths: 1, includeScenarios: false)` и возвращает только `TagSummaries`. По спецификации FORECAST_ENGINE.md §2.6, агрегация тегов не ограничена горизонтом — учитываются все операции пользователя. Минимальный горизонт (1 месяц) влияет только на построение Account Timelines, не на теги.

---

## Решение 8: AccountRepository использует транзакцию для UpdateBalancesAsync

**Инструкция:** `UpdateBalancesAsync` — атомарное обновление балансов.

**Решение:** Реализована транзакция: DELETE всех балансов для AccountId + INSERT новых. Это обеспечивает атомарность обновления мультивалютных балансов.

---

## Решение 9: Поле Tags нормализуется в endpoints

**Инструкция:** `Tags` — JSON-массив строк.

**Решение:** В `OperationsEndpoints.CreateOperation` теги нормализуются: `trim()` + `lowercase()`. В репозитории при чтении/записи используется `System.Text.Json` для сериализации в строку JSON для MySQL.

---

## Решение 10: Dockerfile помещён в src/CashPulse.Api/

**Инструкция:** Dockerfile в `CashPulse.Api/`.

**Решение:** Dockerfile расположен в `src/CashPulse.Api/Dockerfile`. Контекст сборки Docker должен быть корнем репозитория (`M:\Projects\financeCounter\`). Команда запуска: `docker build -f src/CashPulse.Api/Dockerfile .`

---

## Решение 11: Microsoft.Extensions.* добавлены в CashPulse.Infrastructure.csproj

**Инструкция:** Только Dapper и MySqlConnector в Infrastructure.

**Решение:** Добавлены `Microsoft.Extensions.DependencyInjection.Abstractions`, `Microsoft.Extensions.Hosting.Abstractions`, `Microsoft.Extensions.Logging.Abstractions`, `Microsoft.Extensions.Configuration.Abstractions`. Они необходимы для `IServiceCollection`, `BackgroundService`, `ILogger<T>` в DependencyInjection.cs и Services.

---

## Решение 12: wentBelowThreshold не используется — planned improvement

**Статус:** Остаётся переменная-заглушка для будущей логики (алерт уже выдаётся через первый переход ниже порога, но флаг не сбрасывается). Warning CS0219 несущественен и подавлен логикой: достаточно только превентивных проверок первого перехода.

---

## Решение 13: AccountsEndpoints не использует RequireAuthorization()

**Инструкция:** Код примера содержал `RequireAuthorization()`.

**Решение:** В MVP `RequireAuthorization()` удалён — аутентификация заменена на `DevUserMiddleware` с хардкоденным UserId=1. Добавление RequireAuthorization без JWT-конфигурации приведёт к ошибке 401.

---

## Решение 14: IServiceScopeFactory в ExchangeRateRefreshService

**Инструкция:** BackgroundService для обновления курсов.

**Решение:** `ExchangeRateRefreshService` использует `IServiceScopeFactory` для создания скопированных зависимостей. BackgroundService является singleton, поэтому не может напрямую использовать scoped-сервисы (IExchangeRateService, IExchangeRateRepository).
