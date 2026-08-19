import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';

WebBrowser.maybeCompleteAuthSession();

// Reuses the SAME Google OAuth web client as frontend/components/GoogleSignInButton.tsx
// (NEXT_PUBLIC_GOOGLE_CLIENT_ID there, EXPO_PUBLIC_GOOGLE_CLIENT_ID here) —
// backend/services/google_auth.py verifies the ID token's audience against a
// single GOOGLE_CLIENT_ID, so mobile must request a token for that same
// client rather than registering a separate Android client. This works via
// the OAuth implicit id_token flow (a browser redirect, like the Click.uz
// payment flow already used elsewhere) instead of a native Google Sign-In
// module, avoiding a second Google Cloud client + SHA-1 fingerprint setup.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
  loading?: boolean;
}

// GOOGLE_CLIENT_ID sozlanmagan bo'lsa, tugma umuman ko'rsatilmaydi — web
// versiyasidagi bir xil tamoyil (frontend/components/GoogleSignInButton.tsx).
export function GoogleSignInButton({ onCredential, onError, loading }: GoogleSignInButtonProps) {
  const { colors } = useTheme();
  const nonceRef = useRef(Crypto.randomUUID());
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'gapirai' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID ?? '',
      scopes: ['openid', 'email', 'profile'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      extraParams: { nonce: nonceRef.current },
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      onCredential(response.params.id_token);
    } else if (response?.type === 'error') {
      onError?.(response.params.error_description || "Google orqali kirishda xatolik yuz berdi.");
    }
  }, [response, onCredential, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  const busy = loading || !request;

  return (
    <Pressable
      disabled={busy}
      onPress={() => promptAsync()}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 }]}
    >
      {loading ? (
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
