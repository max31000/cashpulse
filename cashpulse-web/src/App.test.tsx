import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { reloadMe } from '@mvv42/kit/platform';
import { server } from './test/msw-handlers';
import { meSignedIn } from './test/fixtures';
import App from './App';

function renderAt(path: string) {
  window.history.pushState({}, '', `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`);
  return render(<App />);
}

afterEach(async () => {
  window.history.pushState({}, '', '/');
  await reloadMe().catch(() => undefined);
});

describe('App shell', () => {
  it('shows the kit layout with CashPulse navigation for a signed-in user', async () => {
    server.use(http.get('*/auth/api/me', () => HttpResponse.json(meSignedIn)));
    renderAt('/');

    const nav = await screen.findByRole('navigation', { name: /CashPulse/ });
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(labels).toEqual(['Дашборд', 'Операции', 'Счета', 'Сценарии', 'Теги', 'Источники дохода', 'Настройки']);
    expect(within(nav).getByRole('link', { name: 'Дашборд' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument();
    // no own login / logout UI any more
    expect(screen.queryByText('Выйти')).not.toBeInTheDocument();
  });

  it('asks an anonymous visitor to log in instead of rendering pages', async () => {
    server.use(
      http.get('*/auth/api/me', () =>
        HttpResponse.json({ user: null, apps: [{ id: 'cashpulse', anonymous: false, access: 'public', granted: false }] }),
      ),
    );
    renderAt('/accounts');

    expect(await screen.findByRole('button', { name: /Войти через Telegram/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Счета' })).not.toBeInTheDocument();
  });

  it('removes the legacy token store on startup', async () => {
    localStorage.setItem('cashpulse-auth', JSON.stringify({ state: { token: 'old' } }));
    server.use(http.get('*/auth/api/me', () => HttpResponse.json(meSignedIn)));
    renderAt('/');

    await screen.findByRole('navigation', { name: /CashPulse/ });
    expect(localStorage.getItem('cashpulse-auth')).toBeNull();
  });
});
