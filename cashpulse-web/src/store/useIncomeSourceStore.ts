import { create } from 'zustand';
import type { IncomeSource } from '../api/types';
import { getIncomeSources } from '../api/incomeSources';

interface IncomeSourceStore {
  sources: IncomeSource[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addSource: (s: IncomeSource) => void;
  updateSource: (s: IncomeSource) => void;
  removeSource: (id: number) => void;
}

export const useIncomeSourceStore = create<IncomeSourceStore>((set) => ({
  sources: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await getIncomeSources();
      set({ sources: data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  addSource: (s) => set((st) => ({ sources: [...st.sources, s] })),
  updateSource: (s) =>
    set((st) => ({ sources: st.sources.map((x) => (x.id === s.id ? s : x)) })),
  removeSource: (id) =>
    set((st) => ({ sources: st.sources.filter((x) => x.id !== id) })),
}));
