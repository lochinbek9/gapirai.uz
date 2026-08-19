import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

// Shared shell for the static content screens (about/faq/privacy/terms) —
// header with a back link + scrollable content area, matching the
// glass-card-on-gradient look the rest of the app already uses.
export function InfoScreenLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.headerAction, { color: colors.accent }]}>{'< Orqaga'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText variant="secondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}

          <ThemedView style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {children}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function InfoSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <ThemedView style={styles.section}>
      <ThemedText style={styles.sectionHeading}>{heading}</ThemedText>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  headerAction: { fontSize: 14, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 22, fontWeight: '900' },
  subtitle: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 18 },
  section: { gap: 8 },
  sectionHeading: { fontSize: 15, fontWeight: '800' },
});
