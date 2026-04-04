import { create } from 'zustand';
import type { Category } from '../api/types';
import { getCategories } from '../api/categories';

interface CategoryStore {
  categories: Category[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  removeCategory: (id: number) => void;
}

export const useCategoryStore = create<CategoryStore>((set) => ({
  categories: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await getCategories();
      set({ categories, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  addCategory: (cat) => set((s) => ({ categories: [...s.categories, cat] })),
  updateCategory: (cat) =>
    set((s) => ({ categories: s.categories.map((c) => (c.id === cat.id ? cat : c)) })),
  removeCategory: (id) => set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),
}));
