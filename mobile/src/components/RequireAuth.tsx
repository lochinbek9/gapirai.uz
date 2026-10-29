import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme/ThemeProvider';

/** Kirish talab qiladigan ekran: sessiya aniqlanguncha kutadi, kirilmagan bo'lsa -- kirish sahifasi. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const status = useAuthStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/(auth)/login" />;
  if (status !== 'signedIn') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  return <>{children}</>;
}
