import { apiClient } from './client';
import type { ForecastResponse } from './types';

export const getForecast = (horizonMonths: number = 6, includeScenarios: boolean = true) =>
  apiClient.get<ForecastResponse>(
    `/api/forecast?horizonMonths=${horizonMonths}&includeScenarios=${includeScenarios}`
  );
