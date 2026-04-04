import { create } from 'zustand';
import type { Account } from '../api/types';
import { getAccounts } from '../api/accounts';

interface AccountStore {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addAccount: (account: Account) => void;
  updateAccount: (account: Account) => void;
  removeAccount: (id: number) => void;
}

export const useAccountStore = create<AccountStore>((set) => ({
  accounts: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const accounts = await getAccounts();
      set({ accounts, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),
  updateAccount: (account) =>
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === account.id ? account : a)) })),
  removeAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),
}));
