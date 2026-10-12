# CashPulse Web — Frontend

React 19 + TypeScript SPA, отдаётся nginx на `https://mvv42.ru/cashpulse/` (в shell — во iframe).

## Технологии

- React 19 + TypeScript
- Mantine 9 + `@mvv42/kit` (дизайн-кит mvv42)
- Recharts (графики)
- Zustand (state management)
- React Router v7
- Yarn 1
- Vite

## Запуск

```bash
yarn install
yarn dev        # http://localhost:5173
yarn build      # production сборка в dist/
yarn typecheck  # проверка TypeScript типов без сборки
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `VITE_API_URL` | Префикс API того же origin (запросы идут на `${VITE_API_URL}/api/…`) | `/cashpulse` |

API и вход — same-origin (общий mvv42-аккаунт, httpOnly cookie). В dev Vite проксирует `/cashpulse/api` →
`http://localhost:5000/api` и `/auth` → `http://localhost:5010` (`CASHPULSE_API_TARGET`, `MVV42_AUTH_TARGET`).

UI собран на [`@mvv42/kit`](https://github.com/max31000/mvv42-kit): `Mvv42Provider` (accent `blue`), `AppLayout`,
`Page`/`Section`/`Metric`, `@mvv42/kit/charts`; платформенный клиент (`apiJson`, `requestLogin`, `useMe`). Своих
логина, темы и переключателя темы нет — их дают shell и кит.

## Деплой

`.github/workflows/deploy.yml` (job `frontend`, после `backend`): сборка → `/var/www/cashpulse`. Vite base: `/cashpulse/`.
