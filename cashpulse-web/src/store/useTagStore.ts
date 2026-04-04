import { create } from 'zustand';
import type { TagSummary } from '../api/types';
import { getTagsSummary } from '../api/tags';

interface TagStore {
  tags: TagSummary[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const tags = await getTagsSummary();
      set({ tags, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
