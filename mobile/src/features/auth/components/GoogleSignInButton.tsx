import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  GoogleOneTapSignIn,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import { ThemedText } from '../../../components/ThemedText';
import { GOOGLE_WEB_CLIENT_ID } from '../../../config/env';
import { useTheme } from '../../../theme/ThemeProvider';

// expo-auth-session's browser-redirect Google flow (id_token/code + a custom
// URI scheme redirect) no longer works on Android — as of 2026, Google
// outright blocks custom URI scheme redirects for Android OAuth clients
// ("doesn't comply with Google's OAuth 2.0 policy for keeping apps secure"),
// confirmed against Google's own current native-app OAuth docs and Expo's own
// Google-auth guide, which itself has moved to this same native library.
// Android's Credential Manager (this library) uses the app's registered
// package name + SHA-1 for attestation directly — no redirect_uri at all —
// and returns an ID token audienced to the WEB client id, which
// backend/services/google_auth.py already accepts (valid_audiences includes
// settings.GOOGLE_CLIENT_ID).
//
// Prod prerequisite: an "Android" type OAuth client for uz.gapirai.mobile +
// the signing key's SHA-1 must exist in Google Cloud Console (attestation
// only — no client id is passed here, Google matches by package+SHA-1).
// iOS is not wired yet (button is Android-only below).
/** Google tugmasi ko'rsatiladimi (hozircha faqat Android) */
export const googleSignInAvailable = Platform.OS === 'android';

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
  loading?: boolean;
  text?: 'continue_with' | 'signup_with';
}

export function GoogleSignInButton({ onCredential, onError, loading, text = 'continue_with' }: GoogleSignInButtonProps) {
  const { colors } = useTheme();
  const [signingIn, setSigningIn] = useState(false);

  if (!googleSignInAvailable) return null;

  const busy = loading || signingIn;

  const handlePress = async () => {
    setSigningIn(true);
    try {
      GoogleOneTapSignIn.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
      });
      await GoogleOneTapSignIn.checkPlayServices();
      let response = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.createAccount();
      }
      if (isSuccessResponse(response) && response.data.idToken) {
        onCredential(response.data.idToken);
      } else {
        onError?.('Google orqali kirishda xatolik yuz berdi.');
      }
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        // Foydalanuvchi bekor qildi — xatolik ko'rsatilmaydi.
      } else {
        // Texnik xabarni foydalanuvchiga emas, konsolga -- ekranda tushunarli matn
        console.log('Google sign-in error', err?.code, err?.message);
        onError?.('Google orqali kirib boʻlmadi. Email va parol yoki Telegram orqali kiring.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  // Saytdagi ijtimoiy kirish tugmalari kabi: dumaloq (pill), oq yuza, ingichka chiziq
  return (
    <Pressable
      disabled={busy}
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.rule, backgroundColor: pressed ? colors.ground : colors.surface, opacity: busy ? 0.6 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <GoogleMark />}
      <ThemedText style={styles.label}>{text === 'signup_with' ? 'Google orqali roʻyxatdan oʻtish' : 'Google orqali kirish'}</ThemedText>
    </Pressable>
  );
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
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
