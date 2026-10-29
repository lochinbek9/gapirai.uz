import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, type AppStateStatus, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/api/queryClient';
import { ThemedView } from '../src/components/ThemedView';
import { ShareIntentHandler } from '../src/features/share/ShareIntentHandler';
import { useAuthStore } from '../src/store/useAuthStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

function RootStack() {
  const { mode, colors } = useTheme();
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Session bootstrap gate: avoids a flash of signed-out UI while the stored
  // token (if any) is being validated against GET /auth/me.
  if (status === 'idle' || status === 'loading') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </ThemedView>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.background },
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
