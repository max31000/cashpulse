import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  colorScheme: 'auto' | 'light' | 'dark';
  baseCurrency: string;
  displayName: string;
  email: string;
  setColorScheme: (scheme: 'auto' | 'light' | 'dark') => void;
  setBaseCurrency: (currency: string) => void;
  setDisplayName: (name: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      colorScheme: 'auto',
      baseCurrency: 'RUB',
      displayName: 'Dev User',
      email: 'dev@local',
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setDisplayName: (displayName) => set({ displayName }),
    }),
    {
      name: 'cashpulse-settings',
      partialize: (state) => ({
        colorScheme: state.colorScheme,
        baseCurrency: state.baseCurrency,
        displayName: state.displayName,
      }),
    }
  )
);
