import { Platform } from 'react-native';

// Mirrors frontend/lib/runtime-config.ts: no window.location on native, so the
// dev/production split is driven by __DEV__ instead of hostname sniffing.
const PRODUCTION_API_URL = 'https://api.gapirai.uz';

// The Android emulator can't reach the host machine via `localhost` — it
// must use the special 10.0.2.2 loopback alias. iOS Simulator has no such
// restriction and can use localhost directly. A physical device needs the
// host machine's LAN IP, which is why EXPO_PUBLIC_API_URL should be set
// explicitly when testing on real hardware (see mobile/README.md).
const DEV_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  return __DEV__ ? DEV_API_URL : PRODUCTION_API_URL;
}

export const API_URL = getApiUrl();
