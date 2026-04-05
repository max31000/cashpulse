import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Center, Paper, Title, Text, Stack, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../store/useAuthStore';
import { loginWithTelegram, type TelegramAuthData } from '../api/auth';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'mv_cashpulse_bot';

// Telegram Login Widget вызывает глобальный колбэк после авторизации
declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthData) => void;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, setAuth } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Если уже залогинен — сразу на главную
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Определяем глобальный колбэк до вставки скрипта
    window.onTelegramAuth = async (telegramData: TelegramAuthData) => {
      try {
        const { accessToken, user } = await loginWithTelegram(telegramData);
        setAuth(accessToken, user);
        navigate('/', { replace: true });
      } catch (err) {
        notifications.show({
          title: 'Ошибка входа',
          message: err instanceof Error ? err.message : 'Не удалось войти через Telegram',
          color: 'red',
        });
      }
    };

    // Вставляем Telegram Login Widget script
    if (!containerRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    containerRef.current.appendChild(script);

    return () => {
      // Cleanup при размонтировании
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      delete window.onTelegramAuth;
    };
  }, [navigate, setAuth]);

  return (
    <Center h="100vh" style={{ background: 'var(--mantine-color-body)' }}>
      <Stack align="center" gap="xl">
        <Stack align="center" gap="xs">
          <Text fz={48} lh={1}>≋</Text>
          <Title order={1} c="blue">CashPulse</Title>
          <Text c="dimmed" size="md">Прогнозирование личного денежного потока</Text>
        </Stack>

        <Paper shadow="md" p="xl" radius="md" w={340}>
          <Stack align="center" gap="lg">
            <Title order={3}>Войти</Title>
            <Text c="dimmed" size="sm" ta="center">
              Используй Telegram для входа в приложение
            </Text>

            {/* Контейнер для Telegram Login Widget */}
            <div ref={containerRef} style={{ minHeight: 48 }}>
              <Loader size="sm" />
            </div>
          </Stack>
        </Paper>

        <Text size="xs" c="dimmed">
          Данные хранятся только на твоём сервере
        </Text>
      </Stack>
    </Center>
  );
}
