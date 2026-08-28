import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import {
  GoogleOneTapSignIn,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import { ThemedText } from '../../../components/ThemedText';
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
interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
  loading?: boolean;
}

export function GoogleSignInButton({ onCredential, onError, loading }: GoogleSignInButtonProps) {
  const { colors } = useTheme();
  const [signingIn, setSigningIn] = useState(false);

  if (!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || Platform.OS !== 'android') return null;

  const busy = loading || signingIn;

  const handlePress = async () => {
    setSigningIn(true);
    try {
      GoogleOneTapSignIn.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      });
      await GoogleOneTapSignIn.checkPlayServices();
      let response = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.createAccount();
      }
      if (isSuccessResponse(response) && response.data.idToken) {
        onCredential(response.data.idToken);
      } else {
        onError?.("Google orqali kirishda xatolik yuz berdi.");
      }
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        // Foydalanuvchi bekor qildi — xatolik ko'rsatilmaydi.
      } else {
        const errorDetail = err?.message || String(err);
        onError?.(`Google auth error: ${errorDetail}`);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Pressable
      disabled={busy}
      onPress={handlePress}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          <ThemedText style={styles.gLetter}>G</ThemedText>
          <ThemedText style={styles.label}>Google orqali davom etish</ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  gLetter: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4285F4',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
});
