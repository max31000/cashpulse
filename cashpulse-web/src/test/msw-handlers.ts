import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { meSignedIn } from './fixtures';

export const handlers = [
  // mvv42-auth (shared login): signed in, access to cashpulse granted
  http.get('*/auth/api/me', () => HttpResponse.json(meSignedIn)),
  http.get('*/api/accounts', () =>
    HttpResponse.json([
      { id: 1, name: 'Основной', type: 'debit', isArchived: false,
        balances: [{ currency: 'RUB', amount: 50000 }] },
      { id: 2, name: 'Накопления', type: 'debit', isArchived: false,
        balances: [{ currency: 'RUB', amount: 100000 }] },
    ])
  ),
  http.post('*/api/accounts', () =>
    HttpResponse.json(
      { id: 99, name: 'Новый счёт', type: 'debit', isArchived: false, balances: [] },
      { status: 201 }
    )
  ),
  http.get('*/api/operations', () => HttpResponse.json([])),
  http.get('*/api/forecast', () =>
    HttpResponse.json({ timelines: {}, netWorth: [], alerts: [], monthlyBreakdown: [] })
  ),
  http.get('*/api/categories', () => HttpResponse.json([])),
  http.get('*/api/exchange-rates', () => HttpResponse.json([])),
  http.get('*/api/scenarios', () => HttpResponse.json([])),
  http.get('*/api/tags/summary', () => HttpResponse.json([])),
  http.get('*/api/income-sources', () => HttpResponse.json([])),
];

export const server = setupServer(...handlers);
