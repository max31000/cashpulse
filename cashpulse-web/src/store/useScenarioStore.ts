import { create } from 'zustand';
import type { Scenario } from '../api/types';
import { getScenarios } from '../api/scenarios';

interface ScenarioStore {
  scenarios: Scenario[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addScenario: (s: Scenario) => void;
  updateScenario: (s: Scenario) => void;
  removeScenario: (id: number) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  scenarios: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const scenarios = await getScenarios();
      set({ scenarios, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  addScenario: (s) => set((st) => ({ scenarios: [...st.scenarios, s] })),
  updateScenario: (s) =>
    set((st) => ({ scenarios: st.scenarios.map((sc) => (sc.id === s.id ? s : sc)) })),
  removeScenario: (id) =>
    set((st) => ({ scenarios: st.scenarios.filter((sc) => sc.id !== id) })),
}));
