import { apiJson, ApiError, requestLogin } from '@mvv42/kit/platform';
import { useAccessStore } from '../store/useAccessStore';

/**
 * API prefix, same origin as the page: `/cashpulse` → `/cashpulse/api/…` (nginx convention route; Vite proxies
 * it in dev). Auth is the shared mvv42 cookie, so the API must never be called cross-origin.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/cashpulse';

export const SERVICE_ID = 'cashpulse';

function url(path: string): string {
  // Absolute against the page so the same code works in the browser and under jsdom (tests).
  return new URL(`${API_BASE}${path}`, window.location.href).toString();
}

/**
 * JSON (or multipart) request via the kit: cookies, one shared refresh on 401, `ApiError` on non-2xx.
 * A final 401 sends the user to the shell login; a 403 (no access to cashpulse) switches the app to the
 * «Нет доступа» screen. The error is re-thrown either way so callers can stop their spinners.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiJson<T>(url(path), init);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) requestLogin(SERVICE_ID);
      else if (e.status === 403 && e.code !== 'origin_not_allowed') useAccessStore.getState().deny(e);
    }
    throw e;
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, json('POST', body)),
  put: <T>(path: string, body?: unknown) => request<T>(path, json('PUT', body)),
  patch: <T>(path: string, body?: unknown) => request<T>(path, json('PATCH', body)),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** FormData body: the browser sets the multipart boundary itself. */
  postMultipart: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
};
