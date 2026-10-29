import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { AppHeader } from './AppHeader';

/** Har sahifaning qobig'i (saytdagi PageShell): xavfsiz hudud + header + aylantiriladigan kontent. */
export function Screen({
  children,
  ground,
  scroll = true,
  contentStyle,
  scrollRef,
  back,
  refreshControl,
}: {
  children: ReactNode;
  /** Kontent foni ground (auth sahifalari, kulrang bo'limlar) */
  ground?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
  back?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
}) {
  const { colors } = useTheme();
  const bg = ground ? colors.ground : colors.surface;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: colors.surface }]}>
      <AppHeader back={back} />
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
});
