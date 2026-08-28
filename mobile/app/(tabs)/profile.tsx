import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as plansApi from '../../src/features/plans/api';
import { PLAN_NAMES } from '../../src/features/plans/types';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

// New tab (2026-08-22 bottom-nav redesign) — account + plan + sign-out live
// here now instead of the home screen header. Only shows real, already-
// wired functionality (plan/usage from GET /api/plans, videos list, FAQ) —
// no invented settings (language picker, notifications) without a backing
// feature.
export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const { data } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.getPlans,
    enabled: status === 'signedIn',
  });
  const current = data?.current;
  const planName = current ? PLAN_NAMES[current.plan] || current.plan : null;
  const planLimit = data?.plans.find((p) => p.id === current?.plan)?.videos_per_period ?? null;

  if (status !== 'signedIn' || !user) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
          <ThemedView style={styles.header}>
            <ThemedText style={styles.headerTitle}>Profil</ThemedText>
          </ThemedView>
          <ThemedView style={styles.loggedOut}>
            <ThemedText variant="secondary" style={styles.loggedOutText}>
              Profilni ko&apos;rish uchun tizimga kiring.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.primaryButtonText}>Kirish</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profil</ThemedText>
        </ThemedView>

        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.identity}>
            <ThemedView style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <ThemedText style={styles.avatarLabel}>{user.name.charAt(0).toUpperCase()}</ThemedText>
            </ThemedView>
            <ThemedText style={styles.name}>{user.name}</ThemedText>
            <ThemedText variant="secondary" style={styles.email}>
              {user.email}
            </ThemedText>
          </ThemedView>

          {current && (
            <ThemedView style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <ThemedView style={styles.planRow}>
                <ThemedView>
                  <ThemedText variant="secondary" style={styles.planLabel}>
                    Joriy tarif
                  </ThemedText>
                  <ThemedText style={styles.planName}>{planName}</ThemedText>
                </ThemedView>
                <Pressable onPress={() => router.push('/pricing')} style={[styles.upgradeButton, { backgroundColor: colors.accent }]}>
                  <ThemedText style={styles.upgradeButtonText}>
                    {current.plan === 'free' ? 'Premium' : 'Tariflar'}
                  </ThemedText>
                </Pressable>
              </ThemedView>
              {current.plan !== 'free' && planLimit != null && (
                <ThemedText variant="secondary" style={styles.planUsage}>
                  {current.videos_used_this_period} / {planLimit} video ishlatilgan
                </ThemedText>
              )}
            </ThemedView>
          )}

          <ThemedView style={[styles.menu, { borderColor: colors.border }]}>
            <Pressable onPress={() => router.push('/dashboard')} style={styles.menuItem}>
              <ThemedText style={styles.menuLabel}>🎬 Mening videolarim</ThemedText>
            </Pressable>
            <ThemedView style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <Pressable onPress={() => router.push('/faq')} style={styles.menuItem}>
              <ThemedText style={styles.menuLabel}>❓ Yordam</ThemedText>
            </Pressable>
          </ThemedView>

          <Pressable onPress={() => signOut()} style={[styles.signOutButton, { borderColor: colors.border }]}>
            <ThemedText style={{ color: colors.danger, fontWeight: '700' }}>Chiqish</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  loggedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 30 },
  loggedOutText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  identity: { alignItems: 'center', gap: 4, marginTop: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarLabel: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800' },
  email: { fontSize: 13, fontWeight: '500' },
  planCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planName: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  planUsage: { fontSize: 12, fontWeight: '600' },
  upgradeButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  upgradeButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  menu: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 16 },
  menuLabel: { fontSize: 14, fontWeight: '700' },
  menuDivider: { height: StyleSheet.hairlineWidth, width: '100%' },
  primaryButton: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  signOutButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
});
