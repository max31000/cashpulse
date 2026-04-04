import { apiClient } from './client';
import type { ExchangeRate } from './types';

export const getExchangeRates = () => apiClient.get<ExchangeRate[]>('/api/exchange-rates');
export const refreshExchangeRates = () =>
  apiClient.post<{ message: string; rates: ExchangeRate[] }>('/api/exchange-rates/refresh');
export const updateExchangeRate = (fromCurrency: string, toCurrency: string, rate: number) =>
  apiClient.put<ExchangeRate>('/api/exchange-rates', { fromCurrency, toCurrency, rate });
