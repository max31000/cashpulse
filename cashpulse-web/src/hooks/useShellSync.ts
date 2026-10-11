import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Синхронизирует текущий путь с portal-shell через postMessage.
 * Работает только внутри iframe — в standalone-режиме ничего не делает.
 */
export function useShellSync(serviceId: string) {
  const location = useLocation();

  useEffect(() => {
    try {
      if (window.self === window.top) return;
    } catch {
      // Если доступ к window.top заблокирован — значит мы в iframe
    }

    window.parent.postMessage(
      {
        type: 'NAVIGATE',
        serviceId,
        path: location.pathname + location.search + location.hash,
      },
      // Shell и приложение живут на одном origin (https://mvv42.ru/cashpulse/)
      window.location.origin
    );
  }, [location, serviceId]);
}
