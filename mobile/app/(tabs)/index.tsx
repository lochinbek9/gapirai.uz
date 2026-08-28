import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import { AnalyzeForm } from '../../src/features/analysis/components/AnalyzeForm';
import { DubForm } from '../../src/features/dubbing/components/DubForm';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

type Mode = 'dub' | 'analyze';

// Kutubxona/Videolarim/Chiqish moved out of the header — Library is now its
// own tab and Profile (also a tab) covers account + sign-out, per the
// bottom-nav redesign (2026-08-22): keep the home screen to exactly one
// job — "video yubor -> o'zbekcha tushun" — nothing else competing for it.
export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<Mode>('dub');

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.headerLogo}>
            GapirAI<ThemedText style={[styles.headerLogo, { color: colors.accent }]}>.uz</ThemedText>
          </ThemedText>
          {status !== 'signedIn' && (
            <Pressable onPress={() => router.push('/(auth)/login')} hitSlop={8}>
              <ThemedText style={[styles.headerAction, { color: colors.accent }]}>Kirish</ThemedText>
            </Pressable>
          )}
        </ThemedView>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <ThemedView style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <ThemedView style={[styles.badgeDot, { backgroundColor: colors.accent }]} />
              <ThemedText variant="secondary" style={styles.badgeText}>
                AI Studio
              </ThemedText>
            </ThemedView>

            <ThemedText variant="secondary" style={styles.tagline}>
              Video dublyaj va tahlil — sun&apos;iy intellekt yordamida
            </ThemedText>

            {status === 'signedIn' && user && (
              <ThemedText variant="secondary" style={styles.welcome}>
                Xush kelibsiz, {user.name}
              </ThemedText>
            )}

            <ThemedView style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setMode('dub')}
                style={[styles.tab, mode === 'dub' && { backgroundColor: colors.background }]}
              >
                <ThemedText style={[styles.tabLabel, mode === 'dub' && { color: colors.accent }]}>
                  O'rganish
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setMode('analyze')}
                style={[styles.tab, mode === 'analyze' && { backgroundColor: colors.background }]}
              >
                <ThemedText style={[styles.tabLabel, mode === 'analyze' && { color: colors.accent }]}>
                  Video tahlil qilish
                </ThemedText>
              </Pressable>
            </ThemedView>

            {mode === 'dub' ? <DubForm /> : <AnalyzeForm />}

            <ThemedView style={[styles.footerLinks, { borderTopColor: colors.border }]}>
              {FOOTER_LINKS.map(({ href, label }) => (
                <Pressable key={href} onPress={() => router.push(href)} hitSlop={6}>
                  <ThemedText variant="secondary" style={styles.footerLink}>
                    {label}
                  </ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const FOOTER_LINKS: { href: '/about' | '/faq' | '/privacy' | '/terms'; label: string }[] = [
  { href: '/about', label: 'Loyiha haqida' },
  { href: '/faq', label: 'FAQ' },
  { href: '/privacy', label: 'Maxfiylik siyosati' },
  { href: '/terms', label: 'Foydalanish shartlari' },
];

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLogo: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerAction: {
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 300,
  },
  welcome: { fontSize: 13, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    marginTop: 10,
    width: '100%',
  },
  footerLink: {
    fontSize: 11,
    fontWeight: '600',
  },
});
