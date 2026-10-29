import { useShareIntentContext } from 'expo-share-intent';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { useShareStore } from '../../store/useShareStore';
import { findYoutubeUrl } from '../../utils/youtube';

// "Ulashish -> GapirAI": YouTube ilovasidan havola yoki Galereyadan video keladi.
// Uni useShareStore'ga qo'yib bosh ekranni ochadi -- DubForm formani to'ldiradi
// (store yuborish muvaffaqiyatli bo'lgandagina tozalanadi: ekran qayta yaratilsa ham yo'qolmaydi).
export function ShareIntentHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const setShared = useShareStore((s) => s.setShared);
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();

  useEffect(() => {
    if (error) console.warn('Share intent xatosi:', error);
  }, [error]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const video = (shareIntent.files || []).find((f) => (f.mimeType || '').startsWith('video/'));
    const url = findYoutubeUrl(shareIntent.webUrl) || findYoutubeUrl(shareIntent.text);

    if (video) {
      setShared({
        file: {
          uri: video.path,
          name: video.fileName || 'video.mp4',
          size: video.size ?? null,
          mimeType: video.mimeType ?? null,
          durationMs: video.duration ?? null,
        },
      });
      if (pathname !== '/') router.navigate('/');
    } else if (url) {
      setShared({ url });
      if (pathname !== '/') router.navigate('/');
    } else {
      Alert.alert('GapirAI', 'Faqat YouTube havolasi yoki video faylni ulashish mumkin.');
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent, setShared, router, pathname]);

  return null;
}
