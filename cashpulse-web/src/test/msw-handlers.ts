import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
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
  http.get('*/api/operations', () => HttpResponse.json({ items: [], total: 0 })),
  http.get('*/api/forecast', () =>
    HttpResponse.json({ timelines: {}, netWorth: [], alerts: [], monthlyBreakdown: [] })
  ),
  http.get('*/api/categories', () => HttpResponse.json([])),
  http.get('*/api/exchange-rates', () => HttpResponse.json([])),
];

export const server = setupServer(...handlers);
