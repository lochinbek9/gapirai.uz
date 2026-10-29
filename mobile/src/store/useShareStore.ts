import { create } from 'zustand';

import type { LocalVideo } from '../features/dubbing/types';

// Boshqa ilovadan (YouTube, Galereya) "Ulashish -> GapirAI" orqali kelgan narsa.
// Bosh ekran (DubForm) uni o'qib formani to'ldiradi va tozalaydi -- kirish
// ekraniga o'tib qaytilsa ham yo'qolmaydi.
interface ShareState {
  pendingUrl: string | null;
  pendingFile: LocalVideo | null;
  setShared: (shared: { url?: string | null; file?: LocalVideo | null }) => void;
  clear: () => void;
}

export const useShareStore = create<ShareState>((set) => ({
  pendingUrl: null,
  pendingFile: null,
  setShared: ({ url = null, file = null }) => set({ pendingUrl: url, pendingFile: file }),
  clear: () => set({ pendingUrl: null, pendingFile: null }),
}));
