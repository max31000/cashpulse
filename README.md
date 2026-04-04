# CashPulse — Personal Cash Flow Forecaster

Веб-приложение для прогнозирования личного денежного потока. Вводите текущие балансы счетов,
запланированные доходы и расходы — система строит проекцию баланса на 3/6/12 месяцев вперёд,
подсвечивает моменты риска и позволяет тестировать финансовые сценарии ("а если куплю машину?").

**Целевой пользователь:** финансово грамотный человек с несколькими источниками дохода,
мультивалютными счетами и кредитными картами.

## Возможности

- 📊 Прогноз баланса на 3/6/12 месяцев с визуализацией рисков
- 💳 Учёт кредитных карт с грейс-периодом и минимальными платежами
- 🔮 What-if сценарии
- 🏷 Группировка трат по тегам/проектам
- 💱 Мультивалютность (RUB/USD/EUR) с курсами ЦБ РФ
- 📥 Импорт операций из CSV

## Архитектура

```
Backend (C# / ASP.NET Core 8 Minimal API)
  └── CashPulse.Api         — HTTP endpoints, middleware
  └── CashPulse.Core        — Domain models, ForecastEngine (чистая логика)
  └── CashPulse.Infrastructure — Dapper repositories, MySQL, Exchange rates

Frontend (React 18 + TypeScript + Mantine v7)
  └── cashpulse-web/        — Vite app, деплой на GitHub Pages

Database: MySQL 8 (Docker)
Deploy: GitHub Actions → VDS (Docker)
```

## Локальный запуск

### Предварительные требования
- .NET 8 SDK
- Node.js 20+, Yarn 4 (corepack enable)
- Docker + Docker Compose

### Backend + MySQL

```bash
# Запустить MySQL в Docker
docker compose up mysql -d

# Запустить бэкенд (миграции применятся автоматически при старте)
cd src/CashPulse.Api
dotnet run
# API доступен на http://localhost:5000
# Swagger UI: http://localhost:5000/swagger
```

### Frontend

```bash
cd cashpulse-web
yarn install
yarn dev
# Приложение на http://localhost:5173
```

**Фронтенд по умолчанию стучится на `http://localhost:5000` (переменная `VITE_API_URL`).**

### Переменные окружения

Скопировать `.env.example` → `.env` и заполнить:

```bash
# Backend
ConnectionStrings__DefaultConnection="Server=localhost;Database=cashpulse;User=root;Password=cashpulse_dev;"

# Frontend (cashpulse-web/.env)
VITE_API_URL=http://localhost:5000
```

---

## Деплой на VDS

### Предварительные требования на VDS
- Ubuntu + Docker установлен
- Порт 5000 открыт (или настроен через nginx reverse proxy)

### Первоначальная настройка VDS

```bash
# Сгенерировать SSH ключ для деплоя
ssh-keygen -t ed25519 -C "github-actions-cashpulse" -f ~/.ssh/cashpulse_deploy -N ""
ssh-copy-id -i ~/.ssh/cashpulse_deploy.pub root@<VDS_IP>

# Настроить VDS (создать сеть и запустить MySQL)
bash scripts/deploy-vds.sh
```

### GitHub Secrets

Настроить в `Settings → Secrets and variables → Actions`:

| Secret | Описание | Пример значения |
|--------|----------|-----------------|
| `VDS_HOST` | IP адрес VDS | `89.167.34.3` |
| `VDS_USER` | SSH пользователь | `root` |
| `VDS_SSH_KEY` | Приватный SSH ключ | Содержимое `~/.ssh/cashpulse_deploy` |
| `DB_CONNECTION_STRING` | MySQL строка подключения | `Server=cashpulse-mysql;Database=cashpulse;User=root;Password=<пароль>;` |
| `VITE_API_URL` | URL бэкенда (для фронтенда) | `http://89.167.34.3:5000` |

### CI/CD

После настройки Secrets — любой `git push origin main` автоматически:
- Запускает тесты
- Собирает Docker-образ бэкенда
- Деплоит на VDS
- Деплоит фронтенд на GitHub Pages (`https://max31000.github.io/cashpulse/`)

---

## Структура файлов

```
CashPulse/
├── src/
│   ├── CashPulse.Api/           — ASP.NET Core Minimal API
│   │   ├── Program.cs
│   │   ├── Endpoints/           — AccountsEndpoints, OperationsEndpoints, ForecastEndpoints, ...
│   │   ├── Middleware/          — DevUserMiddleware, ErrorHandlingMiddleware
│   │   └── Dockerfile
│   ├── CashPulse.Core/          — Domain логика
│   │   ├── Models/              — Account, PlannedOperation, RecurrenceRule, ...
│   │   └── Forecast/            — ForecastEngine, RecurrenceExpander, ...
│   └── CashPulse.Infrastructure/ — Dapper репозитории, MySQL, миграции
│       ├── Repositories/
│       ├── Migrations/          — 001_initial_schema.sql, 002_seed_data.sql
│       └── Services/            — ExchangeRateService (ЦБ РФ XML)
├── tests/
│   └── CashPulse.Tests/         — 23 xUnit теста
├── cashpulse-web/               — React + TypeScript + Mantine
│   └── src/
│       ├── api/                 — Типизированный API client
│       ├── store/               — Zustand stores
│       ├── components/          — ForecastChart, AlertsPanel, OperationForm, ...
│       └── pages/               — Dashboard, Operations, Accounts, Scenarios, Tags, Settings
├── .github/workflows/
│   ├── backend.yml              — CI/CD бэкенда
│   └── frontend.yml             — CI/CD фронтенда
├── docker-compose.yml           — Локальная разработка
├── scripts/deploy-vds.sh        — Первоначальная настройка VDS
└── README.md
```

---

## API Reference

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/accounts` | Список счетов с балансами |
| POST | `/api/accounts` | Создать счёт |
| PUT | `/api/accounts/{id}/balances` | Обновить балансы |
| GET | `/api/operations` | Операции (с фильтрами) |
| POST | `/api/operations` | Создать операцию |
| POST | `/api/operations/{id}/confirm` | Отметить как факт |
| GET | `/api/forecast?horizonMonths=6` | Прогноз с алертами |
| GET | `/api/categories` | Категории |
| GET | `/api/scenarios` | Сценарии |
| PUT | `/api/scenarios/{id}/toggle` | Активировать/деактивировать |
| GET | `/api/tags/summary` | Агрегация по тегам |
| GET | `/api/exchange-rates` | Текущие курсы |
| POST | `/api/exchange-rates/refresh` | Обновить из ЦБ РФ |
| POST | `/api/import/csv/preview` | Превью CSV |
| POST | `/api/import/csv` | Импорт CSV |

Swagger UI: `http://localhost:5000/swagger` (только в Development)

---

## MVP ограничения

- **Нет авторизации** — приложение работает как single-user (UserId=1 хардкоден). Google OAuth добавляется при переходе на HTTPS.
- **HTTP только** — деплой на IP без домена, HTTPS не настроен.
- **Курсы валют** — автообновление из ЦБ РФ каждые 12 часов. Для не-рублёвых расчётов использует зафиксированный курс на момент расчёта прогноза.
- **DnD категорий** — drag-and-drop сортировка категорий не реализована в MVP.
