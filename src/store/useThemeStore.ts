import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeStoreState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

// In-memory only for now — defaults to following the OS setting, matching
// the web app's "system theme default" behavior. Persisting the user's
// explicit override (once a theme toggle UI exists) is a later-phase concern.
export const useThemeStore = create<ThemeStoreState>((set) => ({
  preference: 'system',
  setPreference: (preference) => set({ preference }),
}));
