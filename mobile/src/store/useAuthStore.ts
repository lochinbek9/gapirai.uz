import { create } from 'zustand';

import { clearStoredToken, getStoredToken, setStoredToken } from '../api/tokenStorage';
import * as authApi from '../features/auth/api';
import type { User } from '../features/auth/types';

type AuthStatus = 'idle' | 'loading' | 'signedIn' | 'signedOut';

interface AuthStoreState {
  status: AuthStatus;
  user: User | null;
  hydrate: () => Promise<void>;
  setSession: (user: User, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Session bootstrap + storage, per MOBILE_INTEGRATION_AUDIT.md §5.2: the JWT
// has no refresh token, so an invalid/expired token on hydrate just means
// "signed out" — there is nothing to refresh, only re-login.
export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'idle',
  user: null,

  hydrate: async () => {
    set({ status: 'loading' });
    const token = await getStoredToken();
    if (!token) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const user = await authApi.me();
      set({ status: 'signedIn', user });
    } catch {
      await clearStoredToken();
      set({ status: 'signedOut', user: null });
    }
  },

  setSession: async (user, token) => {
    await setStoredToken(token);
    set({ status: 'signedIn', user });
  },

  signOut: async () => {
    // Client-side only — backend/api/auth_routes.py has no logout endpoint.
    await clearStoredToken();
    set({ status: 'signedOut', user: null });
  },
}));
