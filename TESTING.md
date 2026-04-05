# TESTING.md — Стратегия тестирования CashPulse

## 1. Цели и принципы тестирования

### Что и зачем тестируем

| Область | Приоритет | Обоснование |
|---|---|---|
| ForecastEngine, RecurrenceExpander | Критический | Бизнес-логика прогнозирования — ошибка напрямую искажает данные пользователя |
| DepositAccrualService, ExchangeRateService | Высокий | Финансовые вычисления, разбор внешних XML-ответов |
| TelegramAuthService | Высокий | Аутентификация — уязвимость безопасности при баге |
| Endpoints (HTTP API) | Высокий | Контракт между фронтом и бэком |
| Repository | Средний | Проверяем SQL-запросы на реальной БД |
| React-компоненты | Средний | Формы с бизнес-логикой (валидация, условные поля) |
| UI-снапшоты, Telegram Widget | Низкий / не тестируем | Хрупкие, высокий процент ложных срабатываний |

### Принципы

1. **Поведение, не реализация.** Тест проверяет что делает код, а не как. Смена приватного метода не должна ломать тест.
2. **Читаемость.** Тест — это документация. Через полгода должно быть понятно без комментариев.
3. **Независимость.** Тесты не зависят от порядка выполнения. Каждый тест оставляет систему в том же состоянии, что и застал.
4. **Детерминизм.** Никаких `DateTime.Now` в тестируемом коде — только инжектируемый `ITimeProvider`.

### Пирамида тестирования для CashPulse

```
          /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
         /   E2E (Playwright)  \   ← второй приоритет, опционально
        /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
       /  Integration Tests       \  ← Endpoints + Repositories (Docker)
      /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
     /   Unit Tests (xUnit/Vitest)  \  ← Core-слой + utils + stores
    /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
```

---

## 2. Backend тестирование

### 2.1 Юнит-тесты — `CashPulse.Tests` (существующий проект)

**Фреймворк:** xUnit 2.9, Moq 4.20, FluentAssertions 6.x

**Запуск:**
```bash
dotnet test tests/CashPulse.Tests/
dotnet test tests/CashPulse.Tests/ --logger "console;verbosity=detailed"
```

**Что тестируется:** только `CashPulse.Core` — без IO, без БД, без HTTP.

**Конвенция именования:** `MethodName_StateUnderTest_ExpectedBehavior`

```csharp
// Хорошо
public void Calculate_WithOverdraftAccount_ReturnsNegativeBalance() { }
public void Expand_WeeklyRecurrence_GeneratesCorrectDates() { }

// Плохо
public void Test1() { }
public void CalculateWorks() { }
```

#### Уже покрыто

| Файл | Тестов |
|---|---|
| `ForecastEngineTests.cs` | 8 |
| `RecurrenceExpanderTests.cs` | 15 |

#### Новые тест-файлы

**`DepositAccrualServiceTests.cs`**
```csharp
public class DepositAccrualServiceTests
{
    private readonly DepositAccrualService _sut;

    public DepositAccrualServiceTests()
    {
        _sut = new DepositAccrualService();
    }

    [Fact]
    public void Calculate_SimpleAnnualRate_ReturnsCorrectAccrual()
    {
        var result = _sut.Calculate(principal: 100_000m, annualRate: 0.12m, days: 30);

        result.Should().BeApproximately(986.30m, precision: 0.01m);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Calculate_NonPositivePrincipal_ThrowsArgumentException(decimal principal)
    {
        var act = () => _sut.Calculate(principal, annualRate: 0.1m, days: 30);

        act.Should().Throw<ArgumentException>();
    }
}
```

**`TelegramAuthServiceTests.cs`**
```csharp
public class TelegramAuthServiceTests
{
    private const string BotToken = "test_bot_token_123";
    private readonly TelegramAuthService _sut;

    public TelegramAuthServiceTests()
    {
        var options = Options.Create(new TelegramOptions { BotToken = BotToken });
        _sut = new TelegramAuthService(options);
    }

    [Fact]
    public void Validate_ValidHash_ReturnsTrue()
    {
        var data = TelegramAuthDataBuilder.ValidFor(BotToken);

        var result = _sut.Validate(data);

        result.Should().BeTrue();
    }

    [Fact]
    public void Validate_TamperedData_ReturnsFalse()
    {
        var data = TelegramAuthDataBuilder.ValidFor(BotToken);
        data["first_name"] = "hacker";  // изменили поле после подписи

        var result = _sut.Validate(data);

        result.Should().BeFalse();
    }

    [Fact]
    public void Validate_ExpiredAuthDate_ReturnsFalse()
    {
        var data = TelegramAuthDataBuilder.ExpiredFor(BotToken, hoursAgo: 25);

        var result = _sut.Validate(data);

        result.Should().BeFalse();
    }
}
```

**`ExchangeRateServiceTests.cs`**
```csharp
public class ExchangeRateServiceTests
{
    private readonly ExchangeRateService _sut;

    public ExchangeRateServiceTests()
    {
        _sut = new ExchangeRateService();
    }

    [Fact]
    public void ParseXml_ValidCbrResponse_ExtractsUsdRate()
    {
        var xml = File.ReadAllText("TestData/cbr_response_sample.xml");

        var rates = _sut.ParseXml(xml);

        rates.Should().ContainKey("USD");
        rates["USD"].Should().BeGreaterThan(0);
    }

    [Fact]
    public void ParseXml_MissingCurrency_DoesNotThrow()
    {
        var xml = File.ReadAllText("TestData/cbr_response_no_usd.xml");

        var act = () => _sut.ParseXml(xml);

        act.Should().NotThrow();
    }
}
```

> Тестовые XML-файлы хранить в `tests/CashPulse.Tests/TestData/` с атрибутом `Copy to Output Directory = Always`.

---

### 2.2 Интеграционные тесты — `CashPulse.IntegrationTests` (новый проект)

**Фреймворк:** xUnit + `Microsoft.AspNetCore.Mvc.Testing` + `Testcontainers` (MySQL)

**Требование:** Docker должен быть запущен перед выполнением.

**Запуск:**
```bash
dotnet test tests/CashPulse.IntegrationTests/
dotnet test tests/CashPulse.IntegrationTests/ --filter "Category=Endpoints"
```

**Создание проекта:**
```bash
dotnet new xunit -n CashPulse.IntegrationTests -o tests/CashPulse.IntegrationTests
dotnet add tests/CashPulse.IntegrationTests/ reference src/CashPulse.Api/
dotnet add tests/CashPulse.IntegrationTests/ package Testcontainers.MySql
dotnet add tests/CashPulse.IntegrationTests/ package Microsoft.AspNetCore.Mvc.Testing
dotnet add tests/CashPulse.IntegrationTests/ package FluentAssertions
```

#### `Infrastructure/DatabaseFixture.cs`

```csharp
public class DatabaseFixture : IAsyncLifetime
{
    private readonly MySqlContainer _container = new MySqlBuilder()
        .WithDatabase("cashpulse_test")
        .WithUsername("root")
        .WithPassword("test")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await MigrateAsync();
        await SeedAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    private async Task MigrateAsync()
    {
        // применяем те же миграции, что и в prod
        using var conn = new MySqlConnection(ConnectionString);
        var sql = await File.ReadAllTextAsync("TestData/schema.sql");
        await conn.ExecuteAsync(sql);
    }

    private async Task SeedAsync()
    {
        using var conn = new MySqlConnection(ConnectionString);
        await conn.ExecuteAsync("""
            INSERT INTO users (id, telegram_id, username) VALUES (1, 100500, 'testuser');
            INSERT INTO accounts (id, user_id, name, balance, currency)
            VALUES (1, 1, 'Основной', 50000.00, 'RUB'),
                   (2, 1, 'Накопления', 100000.00, 'RUB');
            """);
    }
}
```

#### `Infrastructure/TestWebApplicationFactory.cs`

```csharp
public class TestWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly DatabaseFixture _db = new();

    public HttpClient ApiClient { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _db.InitializeAsync();
        ApiClient = CreateClient();
    }

    public new async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = _db.ConnectionString,
                ["Jwt:Secret"] = JwtTestHelper.TestSecret,
            });
        });
    }
}
```

#### `Infrastructure/JwtTestHelper.cs`

```csharp
public static class JwtTestHelper
{
    public const string TestSecret = "super-secret-key-for-tests-only-32chars!";

    public static string GenerateToken(int userId = 1, string username = "testuser")
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            claims: [new Claim("userId", userId.ToString()),
                     new Claim("username", username)],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static void AddAuth(this HttpClient client, int userId = 1)
    {
        var token = GenerateToken(userId);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
    }
}
```

#### `Endpoints/AccountsEndpointsTests.cs`

```csharp
[Collection("Integration")]
public class AccountsEndpointsTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public AccountsEndpointsTests(TestWebApplicationFactory factory)
    {
        _client = factory.ApiClient;
        _client.AddAuth(userId: 1);
    }

    [Fact]
    public async Task GetAccounts_AuthenticatedUser_ReturnsUserAccounts()
    {
        var response = await _client.GetAsync("/api/accounts");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var accounts = await response.Content.ReadFromJsonAsync<List<AccountDto>>();
        accounts.Should().HaveCount(2);
        accounts!.First().Name.Should().Be("Основной");
    }

    [Fact]
    public async Task GetAccounts_Unauthenticated_Returns401()
    {
        _client.DefaultRequestHeaders.Authorization = null;

        var response = await _client.GetAsync("/api/accounts");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task CreateAccount_ValidPayload_Returns201WithLocation()
    {
        var payload = new { Name = "Новый счёт", Currency = "USD", Balance = 0 };

        var response = await _client.PostAsJsonAsync("/api/accounts", payload);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();
    }
}
```

#### `Repositories/AccountRepositoryTests.cs`

```csharp
[Collection("Integration")]
public class AccountRepositoryTests : IClassFixture<DatabaseFixture>
{
    private readonly AccountRepository _sut;

    public AccountRepositoryTests(DatabaseFixture db)
    {
        _sut = new AccountRepository(db.ConnectionString);
    }

    [Fact]
    public async Task GetByUserId_ExistingUser_ReturnsAccounts()
    {
        var accounts = await _sut.GetByUserIdAsync(userId: 1);

        accounts.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetByUserId_NonExistingUser_ReturnsEmpty()
    {
        var accounts = await _sut.GetByUserIdAsync(userId: 9999);

        accounts.Should().BeEmpty();
    }
}
```

---

## 3. Frontend тестирование

### 3.1 Настройка Vitest

**Почему Vitest, а не Jest:**
- Нативная интеграция с Vite (нет отдельного transform-слоя)
- В 2–5 раз быстрее за счёт ESM и параллельного выполнения
- Идентичный API с Jest — минимальная кривая обучения

**Установка:**
```bash
yarn add -D vitest @testing-library/react @testing-library/user-event \
           @testing-library/jest-dom msw happy-dom
```

**`vitest.config.ts`:**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

**`src/test/setup.ts`:**
```ts
import '@testing-library/jest-dom';
import { server } from './msw-handlers';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**`src/test/msw-handlers.ts`:**
```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/accounts', () =>
    HttpResponse.json([
      { id: 1, name: 'Основной', balance: 50000, currency: 'RUB' },
    ])
  ),
  http.get('/api/forecast', () =>
    HttpResponse.json({ items: [] })
  ),
];

export const server = setupServer(...handlers);
```

**Запуск:**
```bash
yarn test           # watch-режим
yarn test --run     # однократный прогон (для CI)
yarn test --coverage
```

---

### 3.2 Тесты утилит

**`src/utils/formatMoney.test.ts`:**
```ts
import { describe, it, expect } from 'vitest';
import { formatMoney } from './formatMoney';

describe('formatMoney', () => {
  it('formats positive RUB amount', () => {
    expect(formatMoney(1234.56, 'RUB')).toBe('1 234,56 ₽');
  });

  it('formats negative amount with minus sign', () => {
    expect(formatMoney(-500, 'RUB')).toBe('−500,00 ₽');
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'RUB')).toBe('0,00 ₽');
  });

  it('formats USD amount', () => {
    expect(formatMoney(1000, 'USD')).toBe('$1,000.00');
  });
});
```

---

### 3.3 Тесты Zustand-стора

**`src/store/useAuthStore.test.ts`:**
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout(); // сброс состояния между тестами
  });

  it('initially unauthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('login sets token and user', () => {
    useAuthStore.getState().login({ token: 'jwt123', user: { id: 1, username: 'test' } });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('jwt123');
  });

  it('logout clears state', () => {
    useAuthStore.getState().login({ token: 'jwt123', user: { id: 1, username: 'test' } });
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });
});
```

---

### 3.4 Тесты компонентов

**`src/components/OperationForm/OperationForm.test.tsx`:**
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OperationForm } from './OperationForm';

describe('OperationForm', () => {
  it('shows expense fields by default', () => {
    render(<OperationForm />);

    expect(screen.getByLabelText('Сумма')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Расход' })).toBeChecked();
  });

  it('toggles to income type on click', async () => {
    const user = userEvent.setup();
    render(<OperationForm />);

    await user.click(screen.getByRole('radio', { name: 'Доход' }));

    expect(screen.getByRole('radio', { name: 'Доход' })).toBeChecked();
  });

  it('shows recurrence fields when recurring checkbox is enabled', async () => {
    const user = userEvent.setup();
    render(<OperationForm />);

    await user.click(screen.getByRole('checkbox', { name: /повторяющаяся/i }));

    expect(screen.getByLabelText('Период')).toBeInTheDocument();
  });

  it('requires amount to submit', async () => {
    const user = userEvent.setup();
    render(<OperationForm />);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByText(/введите сумму/i)).toBeInTheDocument();
  });

  it('hides isConfirmed toggle for future operations', async () => {
    const user = userEvent.setup();
    render(<OperationForm />);
    await user.type(screen.getByLabelText('Дата'), '2099-01-01');

    expect(screen.queryByRole('checkbox', { name: /подтверждено/i })).not.toBeInTheDocument();
  });
});
```

**`src/components/AlertsPanel/AlertsPanel.test.tsx`:**
```tsx
import { render, screen } from '@testing-library/react';
import { AlertsPanel } from './AlertsPanel';

const mockAlerts = [
  { id: 1, type: 'overdraft', message: 'Баланс уйдёт в минус через 3 дня' },
  { id: 2, type: 'low_balance', message: 'Остаток ниже минимума' },
];

describe('AlertsPanel', () => {
  it('renders all alert types', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    expect(screen.getByText(/баланс уйдёт в минус/i)).toBeInTheDocument();
    expect(screen.getByText(/остаток ниже минимума/i)).toBeInTheDocument();
  });

  it('renders nothing when alerts is empty', () => {
    const { container } = render(<AlertsPanel alerts={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
```

**`src/components/ProtectedRoute/ProtectedRoute.test.tsx`:**
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../../store/useAuthStore';

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', () => {
    useAuthStore.setState({ isAuthenticated: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
```

---

## 4. Организация файлов

```
tests/
├── CashPulse.Tests/                        ← юнит (существующий)
│   ├── ForecastEngineTests.cs
│   ├── RecurrenceExpanderTests.cs
│   ├── DepositAccrualServiceTests.cs       ← новый
│   ├── TelegramAuthServiceTests.cs         ← новый
│   ├── ExchangeRateServiceTests.cs         ← новый
│   ├── TestBuilders/
│   │   ├── AccountBuilder.cs
│   │   ├── OperationBuilder.cs
│   │   └── UserBuilder.cs
│   └── TestData/
│       ├── cbr_response_sample.xml
│       └── cbr_response_no_usd.xml
│
└── CashPulse.IntegrationTests/             ← новый проект
    ├── CashPulse.IntegrationTests.csproj
    ├── Infrastructure/
    │   ├── TestWebApplicationFactory.cs
    │   ├── DatabaseFixture.cs
    │   └── JwtTestHelper.cs
    ├── Endpoints/
    │   ├── AccountsEndpointsTests.cs
    │   ├── OperationsEndpointsTests.cs
    │   ├── ForecastEndpointsTests.cs
    │   ├── AuthEndpointsTests.cs
    │   ├── DepositsEndpointsTests.cs
    │   └── ExchangeRatesEndpointsTests.cs
    └── Repositories/
        ├── AccountRepositoryTests.cs
        ├── OperationRepositoryTests.cs
        ├── DepositRepositoryTests.cs
        └── UserRepositoryTests.cs

cashpulse-web/src/
├── utils/
│   ├── formatMoney.test.ts
│   └── formatDate.test.ts
├── store/
│   ├── useAuthStore.test.ts
│   └── useAccountStore.test.ts
├── components/
│   ├── OperationForm/
│   │   └── OperationForm.test.tsx
│   ├── AlertsPanel/
│   │   └── AlertsPanel.test.tsx
│   └── ProtectedRoute/
│       └── ProtectedRoute.test.tsx
└── test/
    ├── setup.ts
    └── msw-handlers.ts
```

---

## 5. TestBuilders — builder-паттерн для fixtures

```csharp
// tests/CashPulse.Tests/TestBuilders/AccountBuilder.cs
public class AccountBuilder
{
    private int _id = 1;
    private int _userId = 1;
    private string _name = "Тестовый счёт";
    private decimal _balance = 0m;
    private string _currency = "RUB";

    public AccountBuilder WithBalance(decimal balance) { _balance = balance; return this; }
    public AccountBuilder WithCurrency(string currency) { _currency = currency; return this; }
    public AccountBuilder WithName(string name) { _name = name; return this; }
    public AccountBuilder ForUser(int userId) { _userId = userId; return this; }

    public Account Build() => new Account
    {
        Id = _id,
        UserId = _userId,
        Name = _name,
        Balance = _balance,
        Currency = _currency,
    };
}

// Использование в тесте:
var account = new AccountBuilder()
    .WithBalance(-500m)
    .WithCurrency("USD")
    .Build();
```

---

## 6. Что НЕ тестируем в текущей итерации

| Что | Причина |
|---|---|
| UI-снапшоты (snapshot tests) | Хрупкие: любое изменение вёрстки ломает тест без реальной регрессии |
| Telegram Login Widget | Внешний скрипт, не управляем |
| ExchangeRateRefreshService | BackgroundService — сложен для изолированного тестирования; покрывается интеграционным тестом парсера |
| E2E (Playwright) | Второй приоритет: добавить после стабилизации unit и integration |

---

## 7. CI/CD интеграция

### `backend.yml` (дополнение)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET 8
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Unit tests
        run: dotnet test tests/CashPulse.Tests/ --no-build --logger "github"

      - name: Integration tests (requires Docker)
        run: dotnet test tests/CashPulse.IntegrationTests/ --no-build --logger "github"
        # Docker доступен на ubuntu-latest по умолчанию
```

### `frontend.yml` (дополнение)

```yaml
jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile
        working-directory: cashpulse-web

      - name: Run tests
        run: yarn test --run
        working-directory: cashpulse-web

      - name: Build
        run: yarn build
        working-directory: cashpulse-web
```

---

## 8. Быстрый старт — запуск тестов локально

```bash
# Backend: юнит-тесты
dotnet test tests/CashPulse.Tests/

# Backend: интеграционные тесты (нужен запущенный Docker)
docker info                                          # проверить что Docker работает
dotnet test tests/CashPulse.IntegrationTests/

# Только определённая категория
dotnet test tests/CashPulse.IntegrationTests/ --filter "FullyQualifiedName~Accounts"

# Frontend: запустить один раз
cd cashpulse-web && yarn test --run

# Frontend: watch-режим
cd cashpulse-web && yarn test

# Frontend: с покрытием
cd cashpulse-web && yarn test --coverage
```

---

## 9. Критерии приёмки

Перед слиянием PR в `main` все следующие проверки должны быть зелёными:

- [ ] `dotnet test tests/CashPulse.Tests/` — 0 failed
- [ ] `dotnet test tests/CashPulse.IntegrationTests/` — 0 failed
- [ ] `yarn test --run` — 0 failed
- [ ] Покрытие Core-слоя ≥ 80% (по строкам)
- [ ] Новая бизнес-логика сопровождается тестом
