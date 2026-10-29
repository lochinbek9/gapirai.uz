import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme_preference';

interface ThemeStoreState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

// Saytdagidek: standart -- tizim mavzusi; foydalanuvchi header'dagi tugma bilan
// tanlasa, tanlov saqlanadi (sayt localStorage, ilova SecureStore).
export const useThemeStore = create<ThemeStoreState>((set) => ({
  preference: 'system',
  setPreference: (preference) => {
    set({ preference });
    SecureStore.setItemAsync(KEY, preference).catch(() => {});
  },
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') set({ preference: saved });
    } catch {
      // saqlangan tanlov yo'q -- tizim mavzusi qoladi
    }
  },
}));
