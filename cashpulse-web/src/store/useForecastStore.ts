import { create } from 'zustand';
import type { ForecastResponse } from '../api/types';
import { getForecast } from '../api/forecast';

interface ForecastStore {
  forecast: ForecastResponse | null;
  horizon: number;
  loading: boolean;
  error: string | null;
  setHorizon: (months: number) => void;
  fetch: (horizonMonths?: number) => Promise<void>;
}

export const useForecastStore = create<ForecastStore>((set, get) => ({
  forecast: null,
  horizon: 6,
  loading: false,
  error: null,
  setHorizon: (months) => {
    set({ horizon: months });
    void get().fetch(months);
  },
  fetch: async (horizonMonths) => {
    const months = horizonMonths ?? get().horizon;
    set({ loading: true, error: null });
    try {
      const forecast = await getForecast(months);
      set({ forecast, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
