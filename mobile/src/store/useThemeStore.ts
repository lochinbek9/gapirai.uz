import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

// Saytdagidek: standart -- tizim mavzusi; header'dagi tugma bilan tanlansa saqlanadi.
// Maxfiy emas, shuning uchun SecureStore emas, oddiy fayl: sinxron o'qiladi va
// birinchi kadrdanoq to'g'ri mavzu chiqadi (SecureStore ba'zi telefonlarda soniyalab kechikadi).
const file = () => new File(Paths.document, 'theme-preference.txt');

function readSaved(): ThemePreference {
  try {
    const f = file();
    const v = f.exists ? f.textSync().trim() : '';
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeStoreState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeStoreState>((set) => ({
  preference: readSaved(),
  setPreference: (preference) => {
    set({ preference });
    try {
      file().write(preference);
    } catch {
      // saqlanmasa ham joriy sessiyada ishlaydi
    }
  },
}));
