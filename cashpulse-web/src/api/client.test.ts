import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ApiError } from '@mvv42/kit/platform';
import { server } from '../test/msw-handlers';
import { useAccessStore } from '../store/useAccessStore';
import { apiClient } from './client';

const requestLogin = vi.hoisted(() => vi.fn());
vi.mock('@mvv42/kit/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mvv42/kit/platform')>();
  return { ...actual, requestLogin };
});

afterEach(() => {
  requestLogin.mockReset();
  useAccessStore.getState().reset();
});

describe('apiClient', () => {
  it('calls the API same-origin under /cashpulse/api with cookies, without a Bearer header', async () => {
    let seen: Request | undefined;
    server.use(
      http.get('*/cashpulse/api/accounts', ({ request }) => {
        seen = request;
        return HttpResponse.json([]);
      }),
    );

    await apiClient.get('/api/accounts');

    expect(new URL(seen!.url).origin).toBe(window.location.origin);
    expect(new URL(seen!.url).pathname).toBe('/cashpulse/api/accounts');
    expect(seen!.headers.get('authorization')).toBeNull();
    expect(seen!.credentials).toBe('same-origin');
  });

  it('sends JSON bodies with a JSON content type', async () => {
    let body: unknown;
    let contentType: string | null = null;
    server.use(
      http.post('*/cashpulse/api/scenarios', async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.json();
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await apiClient.post('/api/scenarios', { name: 'x' });

    expect(contentType).toContain('application/json');
    expect(body).toEqual({ name: 'x' });
  });

  it('sends FormData untouched (no JSON content type, so the browser sets the multipart boundary)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(
      http.post('*/cashpulse/api/import/csv/preview', () =>
        HttpResponse.json({ fileName: 'a.csv', headers: [], preview: [], totalPreviewLines: 0 }),
      ),
    );
    const form = new FormData();
    form.append('file', new Blob(['a,b'], { type: 'text/csv' }), 'a.csv');

    await apiClient.postMultipart('/api/import/csv/preview', form);

    const init = fetchSpy.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('content-type')).toBe(false);
    fetchSpy.mockRestore();
  });

  it('final 401 (refresh failed) asks the shell to log in and rejects with ApiError', async () => {
    server.use(
      http.get('*/cashpulse/api/accounts', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
      http.post('*/auth/api/refresh', () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiClient.get('/api/accounts')).rejects.toBeInstanceOf(ApiError);
    expect(requestLogin).toHaveBeenCalledWith('cashpulse');
  });

  it('401 then a successful refresh retries once and succeeds', async () => {
    // jsdom's AbortSignal is not accepted by Node's fetch: drop the kit's refresh timeout signal here.
    const timeout = AbortSignal.timeout;
    (AbortSignal as { timeout?: unknown }).timeout = undefined;
    onTestFinished(() => {
      AbortSignal.timeout = timeout;
    });
    let calls = 0;
    server.use(
      http.get('*/cashpulse/api/accounts', () => {
        calls += 1;
        return calls === 1 ? new HttpResponse(null, { status: 401 }) : HttpResponse.json([{ id: 1 }]);
      }),
      http.post('*/auth/api/refresh', () => new HttpResponse(null, { status: 204 })),
    );

    await expect(apiClient.get('/api/accounts')).resolves.toEqual([{ id: 1 }]);
    expect(calls).toBe(2);
    expect(requestLogin).not.toHaveBeenCalled();
  });

  it('403 switches the app to «Нет доступа»', async () => {
    server.use(http.get('*/cashpulse/api/accounts', () => new HttpResponse(null, { status: 403 })));

    await expect(apiClient.get('/api/accounts')).rejects.toMatchObject({ status: 403 });
    expect(useAccessStore.getState().denied?.status).toBe(403);
    expect(requestLogin).not.toHaveBeenCalled();
  });

  it('a backend error message is surfaced on the thrown error', async () => {
    server.use(
      http.delete('*/cashpulse/api/operations/5', () => HttpResponse.json({ error: 'Operation 5 not found' }, { status: 404 })),
    );

    await expect(apiClient.delete('/api/operations/5')).rejects.toThrow('Operation 5 not found');
    expect(useAccessStore.getState().denied).toBeNull();
  });
});
