import * as SecureStore from 'expo-secure-store';

// Storage primitive only — the login/OTP/refresh flow that populates this
// belongs to Phase 2 (backend/api/auth_routes.py issues a 7-day JWT via
// POST /auth/verify-code; there is no refresh token, see
// MOBILE_INTEGRATION_AUDIT.md §5.2). This module just knows how to persist
// and retrieve whatever token Phase 2 obtains.
const TOKEN_KEY = 'gapirai_auth_token';

// SecureStore (Android Keystore) o'qish ba'zi qurilmalarda bir necha soniya oladi --
// har API so'rovida qayta o'qimaslik uchun bir marta o'qib, xotirada saqlaymiz.
// Bir vaqtdagi so'rovlar bitta o'qishni kutadi.
let cached: Promise<string | null> | null = null;

export function getStoredToken(): Promise<string | null> {
  if (!cached) cached = SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return cached;
}

export async function setStoredToken(token: string): Promise<void> {
  cached = Promise.resolve(token);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  cached = Promise.resolve(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
