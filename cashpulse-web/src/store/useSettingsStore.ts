import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local preferences. The colour scheme is no longer here: it is the site-wide `mvv42-color-scheme` setting owned
 * by the shell / `AppLayout` (the kit migrates the old `cashpulse-settings.colorScheme` value once).
 * The user's name comes from the mvv42 account (`useMe`).
 */
interface SettingsStore {
  baseCurrency: string;
  setBaseCurrency: (currency: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      baseCurrency: 'RUB',
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
    }),
    {
      name: 'cashpulse-settings',
      partialize: (state) => ({ baseCurrency: state.baseCurrency }),
    }
  )
);
