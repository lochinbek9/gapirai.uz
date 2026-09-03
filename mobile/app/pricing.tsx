import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import * as plansApi from '../src/features/plans/api';
import type { PlanDef } from '../src/features/plans/types';
import { useAuthStore } from '../src/store/useAuthStore';
import { useTheme } from '../src/theme/ThemeProvider';

// Variant A: obuna / to'lov mobil ilova ICHIDA amalga oshirilmaydi (Google
// Play Payments siyosati). Bu ekran tariflarni KO'RSATADI; obuna bo'lish
// gapirai.uz saytida (Linking.openURL). To'liq oqim: frontend/app/pricing/page.tsx.

const WEB_PRICING_URL = 'https://gapirai.uz/pricing';

const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, monthly_minutes: 25, priority: false, tts_tier: 'edge' },
  { id: 'standard', name: 'Standart', price: 49000, monthly_minutes: 300, priority: false, tts_tier: 'edge' },
  { id: 'pro', name: 'Pro', price: 199000, monthly_minutes: 400, priority: true, tts_tier: 'premium' },
];

function PlanCard({ plan, isCurrent }: { plan: PlanDef; isCurrent: boolean }) {
  const { colors } = useTheme();
  const isPro = plan.id === 'pro';

  return (
    <ThemedView
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: isPro ? colors.accent : colors.border },
        isPro && styles.cardPro,
      ]}
    >
      {isPro && (
        <ThemedView style={[styles.recommendedBadge, { backgroundColor: colors.accent }]}>
          <ThemedText style={styles.recommendedText}>Tavsiya etiladi</ThemedText>
        </ThemedView>
      )}
      <ThemedText style={styles.planName}>{plan.name}</ThemedText>
      {isCurrent && (
        <ThemedText style={[styles.currentLabel, { color: colors.success }]}>Joriy tarif</ThemedText>
      )}
      <ThemedText style={styles.price}>
        {plan.price === 0 ? 'Bepul' : plan.price.toLocaleString('uz-UZ')}
        {plan.price > 0 && (
          <ThemedText variant="secondary" style={styles.priceSuffix}>
            {' '}
            so&apos;m/oy
          </ThemedText>
        )}
      </ThemedText>

      <ThemedView style={styles.features}>
        <ThemedText variant="secondary" style={styles.featureRow}>
          {'✓'} Oyiga {plan.monthly_minutes} daqiqa dublyaj (1 video — maks. 120 daqiqa)
        </ThemedText>
        <ThemedText variant="secondary" style={styles.featureRow}>
          {'✓'} {plan.priority ? 'Ustuvor navbat' : 'Standart navbat'}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.featureRow}>
          {'✓'} {plan.tts_tier === 'premium' ? 'Premium ovoz sifati' : 'Standart ovoz (Edge)'}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.featureRow}>
          {'✓'} Video tahlil — cheklovsiz
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

export default function PricingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const isLoggedIn = status === 'signedIn';

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.getPlans,
    enabled: isLoggedIn,
  });

  const plans = data?.plans?.length ? data.plans : DEFAULT_PLANS;
  const currentPlan = data?.current?.plan;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.headerAction, { color: colors.accent }]}>{'< Orqaga'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText style={styles.title}>Tarif rejalari</ThemedText>
          <ThemedText variant="secondary" style={styles.subtitle}>
            Har tarif oyiga ma&apos;lum daqiqa dublyaj beradi (haqiqiy video davomiyligi bo&apos;yicha).
            Byudjet tugasa, qo&apos;shimcha daqiqa paketi sotib olasiz — ular tugamaydi.
          </ThemedText>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <ThemedView style={styles.cardsContainer}>
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} isCurrent={currentPlan === plan.id} />
              ))}
            </ThemedView>
          )}

          <ThemedView
            style={[styles.webNotice, { backgroundColor: colors.accentGlow, borderColor: colors.accent }]}
          >
            <ThemedText
              style={{ color: colors.accent, fontSize: 13, textAlign: 'center', fontWeight: '700' }}
            >
              Obuna bo&apos;lish va daqiqa paketlarini sotib olish
            </ThemedText>
            <ThemedText variant="secondary" style={styles.webNoticeText}>
              To&apos;lov gapirai.uz saytida amalga oshiriladi. Obuna bo&apos;lgach, tarif shu ilovada ham
              darhol faollashadi.
            </ThemedText>
            <Pressable
              onPress={() => Linking.openURL(WEB_PRICING_URL).catch(() => {})}
              style={[styles.webButton, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.webButtonText}>Saytda obuna bo&apos;lish</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  headerAction: { fontSize: 14, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 14, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', maxWidth: 320 },
  cardsContainer: { width: '100%', gap: 14, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 10, position: 'relative' },
  cardPro: { borderWidth: 2 },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recommendedText: { color: '#ffffff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  planName: { fontSize: 18, fontWeight: '900', marginTop: 6 },
  currentLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  price: { fontSize: 28, fontWeight: '900' },
  priceSuffix: { fontSize: 13, fontWeight: '500' },
  features: { gap: 8 },
  featureRow: { fontSize: 13 },
  webNotice: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 400,
    gap: 10,
    marginTop: 8,
    alignItems: 'center',
  },
  webNoticeText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  webButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  webButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
