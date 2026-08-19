import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import { getErrorMessage } from '../src/api/errors';
import * as plansApi from '../src/features/plans/api';
import type { PlanDef } from '../src/features/plans/types';
import { useAuthStore } from '../src/store/useAuthStore';
import { useTheme } from '../src/theme/ThemeProvider';

// Mirrors frontend/app/pricing/page.tsx content-wise. Subscribing hands off
// to the system browser for Click's hosted checkout (Linking.openURL)
// instead of an in-app WebView — same pattern already used for dubbing job
// payments in app/video/[id].tsx's initiateClickPayment flow.
const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, videos_per_period: 1, free_minutes: 45, priority: false, tts_tier: 'edge' },
  { id: 'standard', name: 'Standart', price: 49000, videos_per_period: 8, free_minutes: 60, priority: false, tts_tier: 'edge' },
  { id: 'pro', name: 'Pro', price: 149000, videos_per_period: 30, free_minutes: 90, priority: true, tts_tier: 'premium' },
];

function PlanCard({ plan, isCurrent, onSubscribe, subscribing }: {
  plan: PlanDef;
  isCurrent: boolean;
  onSubscribe: (id: string) => void;
  subscribing: boolean;
}) {
  const { colors } = useTheme();
  const isPro = plan.id === 'pro';
  const disabled = plan.id === 'free' || isCurrent || subscribing;

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
        {plan.price > 0 && <ThemedText variant="secondary" style={styles.priceSuffix}> so&apos;m/oy</ThemedText>}
      </ThemedText>

      <ThemedView style={styles.features}>
        <ThemedText variant="secondary" style={styles.featureRow}>
          {'✓'} Oyiga {plan.videos_per_period} ta video{plan.price === 0 ? `, ${plan.free_minutes} daqiqagacha` : ', cheklovsiz davomiylik'}
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

      <Pressable
        onPress={() => onSubscribe(plan.id)}
        disabled={disabled}
        style={[
          styles.subscribeButton,
          disabled
            ? { backgroundColor: colors.border }
            : { backgroundColor: colors.accent },
        ]}
      >
        {subscribing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText style={disabled ? { color: colors.textSecondary, fontWeight: '700' } : styles.subscribeText}>
            {isCurrent ? 'Joriy tarif' : plan.id === 'free' ? 'Hozirgi tarif' : 'Tanlash'}
          </ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

export default function PricingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const isLoggedIn = status === 'signedIn';
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.getPlans,
    enabled: isLoggedIn,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => plansApi.subscribeToPlan(planId),
    onMutate: (planId) => {
      setSubscribingId(planId);
      setError(null);
    },
    onSuccess: async (res) => {
      if (res.success && res.payment_url) {
        await Linking.openURL(res.payment_url);
      } else {
        setError("To'lov havolasini yaratishda xatolik yuz berdi.");
      }
    },
    onError: (err) => setError(getErrorMessage(err, "To'lov havolasini yaratishda xatolik yuz berdi.")),
    onSettled: () => setSubscribingId(null),
  });

  const handleSubscribe = (planId: string) => {
    if (!isLoggedIn) {
      router.push('/(auth)/login');
      return;
    }
    subscribeMutation.mutate(planId);
  };

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
            45 daqiqadan qisqa videolar har doim bepul. Uzunroq videolarni tez-tez dublyaj qilsangiz, oylik
            tarif arzonroq bo&apos;ladi.
          </ThemedText>

          {!isLoggedIn && (
            <ThemedView style={[styles.notice, { backgroundColor: colors.accentGlow, borderColor: colors.accent }]}>
              <ThemedText style={{ color: colors.accent, fontSize: 13, textAlign: 'center' }}>
                Tarifga obuna bo&apos;lish uchun kiring yoki ro&apos;yxatdan o&apos;ting.
              </ThemedText>
            </ThemedView>
          )}

          {error && (
            <ThemedView style={[styles.notice, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13, textAlign: 'center' }}>{error}</ThemedText>
            </ThemedView>
          )}

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <ThemedView style={styles.cardsContainer}>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={currentPlan === plan.id}
                  onSubscribe={handleSubscribe}
                  subscribing={subscribingId === plan.id}
                />
              ))}
            </ThemedView>
          )}
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
  notice: { borderWidth: 1, borderRadius: 16, padding: 12, width: '100%', maxWidth: 400 },
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
  subscribeButton: { paddingVertical: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  subscribeText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
