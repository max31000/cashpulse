import { create } from 'zustand';
import type { ApiError } from '@mvv42/kit/platform';

/** Set when the API answers 403: the signed-in user has no access to CashPulse (grant revoked or not given). */
interface AccessStore {
  denied: ApiError | null;
  deny: (error: ApiError) => void;
  reset: () => void;
}

export const useAccessStore = create<AccessStore>((set) => ({
  denied: null,
  deny: (denied) => set({ denied }),
  reset: () => set({ denied: null }),
}));
