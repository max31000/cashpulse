import { useEffect } from 'react';
import { useForecastStore } from '../store/useForecastStore';

export function useForecast() {
  const { forecast, loading, error, horizon, fetch, setHorizon } = useForecastStore();

  useEffect(() => {
    if (!forecast && !loading) {
      void fetch();
    }
  }, [forecast, loading, fetch]);

  return { forecast, loading, error, horizon, setHorizon };
}
