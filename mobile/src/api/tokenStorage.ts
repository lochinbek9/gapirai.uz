import * as SecureStore from 'expo-secure-store';

// Storage primitive only — the login/OTP/refresh flow that populates this
// belongs to Phase 2 (backend/api/auth_routes.py issues a 7-day JWT via
// POST /auth/verify-code; there is no refresh token, see
// MOBILE_INTEGRATION_AUDIT.md §5.2). This module just knows how to persist
// and retrieve whatever token Phase 2 obtains.
const TOKEN_KEY = 'gapirai_auth_token';

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
