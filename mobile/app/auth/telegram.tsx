import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '../../src/api/errors';
import { Notice } from '../../src/components/Notice';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import * as authApi from '../../src/features/auth/api';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

// gapirai://auth/telegram?id=...&hash=... -- gapirai.uz/auth/app qaytargan imzolangan
// Telegram ma'lumoti. Deep link ham, TelegramSignInButton ham shu yerga olib keladi --
// bir xil imzo ikki marta yuborilmasin.
const handled = new Set<string>();

export default function TelegramAuthScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { id, auth_date, hash, first_name, last_name, username, photo_url } = params;
    if (!id || !auth_date || !hash) {
      setError('Telegram maʼlumoti toʻliq kelmadi. Qaytadan urinib koʻring.');
      return;
    }
    if (handled.has(hash)) return;
    handled.add(hash);
    authApi
      .telegramAuth({
        id: Number(id),
        auth_date: Number(auth_date),
        hash,
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
        ...(username ? { username } : {}),
        ...(photo_url ? { photo_url } : {}),
      })
      .then(async (res) => {
        await setSession(res.user, res.access_token);
        router.dismissTo('/');
      })
      .catch((err) => {
        handled.delete(hash);
        setError(getErrorMessage(err, 'Telegram orqali kirib boʻlmadi.'));
      });
  }, [params, router, setSession]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.ground }]}>
      {error ? (
        <View style={styles.box}>
          <Notice>{error}</Notice>
          <PrimaryButton label="Kirish sahifasiga qaytish" onPress={() => router.replace('/(auth)/login')} />
        </View>
      ) : (
        <>
          <ActivityIndicator color={colors.muted} />
          <ThemedText variant="secondary" style={styles.text}>
            Telegram orqali kirilmoqda...
          </ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  box: { alignSelf: 'stretch', gap: 16 },
  text: { fontSize: 15 },
});
