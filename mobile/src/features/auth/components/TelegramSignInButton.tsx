import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedText } from '../../../components/ThemedText';
import { SITE_URL } from '../../../config/env';
import { useTheme } from '../../../theme/ThemeProvider';
import * as authApi from '../api';

// Telegram orqali kirish (saytdagi TelegramSignInButton bilan bir xil natija):
// gapirai.uz/auth/app?start=telegram -> oauth.telegram.org (bot domeni gapirai.uz bo'lgani
// uchun origin sayt); tasdiqlangach
// Telegram foydalanuvchini gapirai.uz/auth/app ga qaytaradi, u sahifa imzolangan
// ma'lumotni gapirai://auth/telegram?... orqali ilovaga beradi (app/auth/telegram.tsx
// uni /auth/telegram'ga yuborib sessiya ochadi).
//
// openAuthSessionAsync ishlatilmaydi (2026-10-29, "tasdiqladim, qaytmadi"): Android'da u
// ilova har "active" bo'lganda brauzerni yopadi, standart Custom Tab esa NO_HISTORY bilan
// ochiladi (showInRecents: false) -- foydalanuvchi tasdiqlash uchun Telegram ilovasiga
// o'tishi bilan Telegram sahifasi yo'q bo'lardi. showInRecents: true -- sahifa alohida
// task'da tirik qoladi (Telegram'dan "orqaga" bosilsa unga qaytiladi), yakunni deep link
// (app/auth/telegram.tsx) qiladi. createTask: false sinab ko'rildi -- Chrome tabni darhol yopadi.
export function TelegramSignInButton({ text = 'continue_with' }: { text?: 'continue_with' | 'signup_with' }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ['telegram-config'], queryFn: authApi.telegramConfig, staleTime: 60 * 60_000 });

  if (!data?.enabled || !data.bot_id) return null;

  const press = async () => {
    setBusy(true);
    try {
      // To'g'ridan-to'g'ri oauth.telegram.org emas: tarixsiz tabda Telegram tasdiqdan keyin
      // oynani yopadi (frontend/app/auth/app/page.tsx sharhiga qarang)
      const url = `${SITE_URL}/auth/app?start=telegram&bot_id=${data.bot_id}`;
      await WebBrowser.openBrowserAsync(url, { showInRecents: true, showTitle: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable
        onPress={press}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { borderColor: colors.rule, backgroundColor: pressed ? colors.ground : colors.surface, opacity: busy ? 0.6 : 1 },
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <TelegramMark />}
        <ThemedText style={styles.label}>
          {text === 'signup_with' ? 'Telegram orqali roʻyxatdan oʻtish' : 'Telegram orqali kirish'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function TelegramMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill="#2AABEE" />
      <Path
        fill="#FFFFFF"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.03-1.63 4.48-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.1.04.31.02.48-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.83 1.23-.7.07-1.24-.46-1.92-.91-1.07-.7-1.67-1.14-2.71-1.82-1.2-.79-.42-1.23.26-1.94.18-.19 3.3-3.02 3.36-3.28.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.22.32-.44.89-.67Z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  label: { fontSize: 14, fontWeight: '500' },
});
