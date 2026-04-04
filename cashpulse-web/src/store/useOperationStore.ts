import { create } from 'zustand';
import type { PlannedOperation, OperationFilter } from '../api/types';
import { getOperations } from '../api/operations';

interface OperationStore {
  operations: PlannedOperation[];
  loading: boolean;
  error: string | null;
  filter: OperationFilter;
  fetch: (filter?: OperationFilter) => Promise<void>;
  setFilter: (filter: OperationFilter) => void;
  addOperation: (op: PlannedOperation) => void;
  updateOperation: (op: PlannedOperation) => void;
  removeOperation: (id: number) => void;
}

export const useOperationStore = create<OperationStore>((set, get) => ({
  operations: [],
  loading: false,
  error: null,
  filter: {},
  fetch: async (filter) => {
    const f = filter ?? get().filter;
    set({ loading: true, error: null, filter: f });
    try {
      const operations = await getOperations(f);
      set({ operations, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  setFilter: (filter) => {
    set({ filter });
    void get().fetch(filter);
  },
  addOperation: (op) => set((s) => ({ operations: [...s.operations, op] })),
  updateOperation: (op) =>
    set((s) => ({ operations: s.operations.map((o) => (o.id === op.id ? op : o)) })),
  removeOperation: (id) =>
    set((s) => ({ operations: s.operations.filter((o) => o.id !== id) })),
}));
