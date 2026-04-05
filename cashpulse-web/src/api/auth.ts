import type { AuthUser } from '../store/useAuthStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function loginWithTelegram(data: TelegramAuthData): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
      photoUrl: data.photo_url,
      authDate: data.auth_date,
      hash: data.hash,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ошибка авторизации' }));
    throw new Error((err as { error?: string }).error ?? 'Ошибка авторизации');
  }

  return res.json();
}
