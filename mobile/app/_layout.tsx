import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/api/queryClient';
import { ShareIntentHandler } from '../src/features/share/ShareIntentHandler';
import { useAuthStore } from '../src/store/useAuthStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

function RootStack() {
  const { mode, colors } = useTheme();
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Sessiya (SecureStore + /auth/me) fonda aniqlanadi -- ekran kutmaydi; kirishga bog'liq
  // joylar (header tugmasi, RequireAuth ekranlari, forma yuborish) holatni o'zi kutadi.
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ShareIntentHandler />
    </>
  );
}

// Wires TanStack Query's focus concept to RN's AppState so polling hooks
// (useDubbingJob, and Phase 6's analysis polling) automatically pause when
// backgrounded and refetch on foreground — per MOBILE_INTEGRATION_AUDIT.md
// §19 ("Polling faqat app foregroundda faol bo'lsin").
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export default function RootLayout() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    // expo-share-intent: provider eng yuqorida bo'lishi kerak (README)
    <ShareIntentProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <RootStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}
