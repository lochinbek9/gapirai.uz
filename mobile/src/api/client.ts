import { router } from 'expo-router';
import axios from 'axios';

import { API_URL } from '../config/env';
import { getStoredToken } from './tokenStorage';
// Circular with useAuthStore.ts (-> features/auth/api.ts -> this file), but
// safe: both sides only touch the import inside a callback body, never at
// module-evaluation time, so live-binding resolution has settled by then.
import { useAuthStore } from '../store/useAuthStore';

// Centralized transport for every backend call the app makes. Feature
// modules (auth, dubbing, analysis — added from Phase 2 onward) build on top
// of this client rather than creating their own axios instances, matching
// frontend/lib/api.ts's apiClient pattern.
export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mirrors frontend/lib/api.ts's 401 interceptor (added 2026-08-22 after a
// rotated backend SECRET_KEY silently invalidated every stored token — every
// request just failed with 401 while the app still looked "signed in").
// `/auth/...` calls are excluded: a 401 there is an expected login/reset
// error the calling screen already surfaces, not a session expiring.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      useAuthStore.getState().signOut();
      router.replace('/(auth)/login');
    }
    return Promise.reject(error);
  }
);
