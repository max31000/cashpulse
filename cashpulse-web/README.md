# CashPulse Web — Frontend

React 18 + TypeScript приложение, деплоится на GitHub Pages.

## Технологии

- React 18 + TypeScript
- Mantine (UI компоненты)
- Recharts (графики)
- Zustand (state management)
- React Router v7
- Yarn 4 (Berry)
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
| `VITE_API_URL` | URL бэкенда | `http://localhost:5000` |

Для локальной разработки создать `.env`:
```
VITE_API_URL=http://localhost:5000
```

## GitHub Pages

Приложение деплоится на `https://max31000.github.io/cashpulse/`.

Vite base path: `/cashpulse/` (настроено в `vite.config.ts`).

SPA routing реализован через `public/404.html` (GitHub Pages redirect hack).
