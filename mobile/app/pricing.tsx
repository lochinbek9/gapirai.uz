import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Accordion } from '../src/components/Accordion';
import { Card } from '../src/components/Card';
import { Footer } from '../src/components/Footer';
import { Notice } from '../src/components/Notice';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { ThemedText } from '../src/components/ThemedText';
import { PAYMENTS_ENABLED } from '../src/config/env';
import { usePayment } from '../src/features/payments/usePayment';
import * as plansApi from '../src/features/plans/api';
import type { MinutePack, PlanDef } from '../src/features/plans/types';
import { useAuthStore } from '../src/store/useAuthStore';
import { alpha } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';
import { formatNumber as som } from '../src/utils/format';

// frontend/app/pricing/page.tsx bilan bir xil tuzilish. To'lov: Click/Payme sahifasi ilova
// ustida ochiladi (usePayment). Google Play build'da (PAYMENTS_ENABLED=false) bu sahifa
// umuman yo'q -- menyudan ham olib tashlangan, to'g'ridan-to'g'ri ochilsa bosh sahifaga qaytadi.

// API javob bermasa -- backend/services/plans.py PLANS bilan bir xil
const DEFAULT_PLANS: PlanDef[] = [
  { id: 'free', name: 'Bepul', price: 0, monthly_minutes: 5, priority: false, tts_tier: 'gemini', tier: 'free', period_days: 30, max_resolution: '360p' },
  { id: 'standard', name: 'Standart', price: 49000, monthly_minutes: 350, priority: true, tts_tier: 'gemini', tier: 'standard', period_days: 30, max_resolution: '720p' },
  { id: 'standard_yearly', name: 'Standart (yillik)', price: 490000, monthly_minutes: 350, priority: true, tts_tier: 'gemini', tier: 'standard', period_days: 365, max_resolution: '720p' },
  { id: 'pro', name: 'Pro', price: 199000, monthly_minutes: 600, priority: true, tts_tier: 'gemini', tier: 'pro', period_days: 30, max_resolution: '1080p' },
  { id: 'pro_yearly', name: 'Pro (yillik)', price: 1990000, monthly_minutes: 600, priority: true, tts_tier: 'gemini', tier: 'pro', period_days: 365, max_resolution: '1080p' },
];

const DEFAULT_PACKS: MinutePack[] = [
  { minutes: 15, price: 4900, one_time: true },
  { minutes: 35, price: 15000 },
  { minutes: 70, price: 25000 },
  { minutes: 140, price: 45000 },
  { minutes: 350, price: 100000 },
];

const PLAN_NOTE: Record<string, string> = {
  free: 'Xizmatni sinab koʻrish uchun',
  standard: 'Muntazam koʻradigan va oʻrganadiganlar uchun',
  pro: 'Koʻp video bilan ishlaydigan blogerlar va jamoalar uchun',
};

const RULES: [string, string][] = [
  ['Haqiqiy davomiylik', '12 daqiqa 40 soniyalik video — 12,7 daqiqa. Yaxlitlash yoki yashirin toʻlov yoʻq.'],
  ['Avval obuna, keyin paket', 'Avval obunaning 30 kunlik daqiqalari ishlatiladi, ular tugasa — sotib olingan, kuymaydigan daqiqalar.'],
  ['30 kunda yangilanadi', 'Obuna daqiqalari har 30 kunda yangilanadi; ishlatilmagan qoldiq keyingi davrga oʻtmaydi.'],
  ['Nosozlikda qaytariladi', 'Video texnik sabab bilan tayyor boʻlmasa, sarflangan daqiqa balansingizga avtomatik qaytadi.'],
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Obunani bekor qilish yoki boshqa tarifga oʻtish mumkinmi?', a: 'Ha, istalgan vaqtda tarifni oʻzgartirishingiz yoki toʻxtatishingiz mumkin. Majburiy muddat yoki jarima yoʻq.' },
  { q: 'Qaysi kartalar bilan toʻlash mumkin?', a: 'Click, Payme, Uzum yoki Paynet orqali — Uzcard, Humo yoki Visa kartangiz bilan.' },
  { q: 'Subtitr ham daqiqa sarflaydimi?', a: 'Ha, subtitr ham dublaj kabi video davomiyligicha daqiqa sarflaydi. Tezkor tahlil (xulosa, konspekt, test) daqiqa sarflamaydi.' },
  { q: 'Bepul tarifda nima bor?', a: 'Har 30 kunda 5 daqiqa dublaj yoki subtitr, 360p sifatda yuklab olish. Uzunroq videolar uchun bir martalik paket yoki obuna oling.' },
];

export default function PricingRoute() {
  return PAYMENTS_ENABLED ? <PricingScreen /> : <Redirect href="/" />;
}

function PricingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.status === 'signedIn');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const payment = usePayment();

  const { data, isLoading } = useQuery({ queryKey: ['plans'], queryFn: plansApi.getPlans });
  const current = data?.current;
  const plans = (data?.plans?.length ? data.plans : DEFAULT_PLANS).filter(
    (p) => (p.tier ?? p.id) === 'free' || (p.period_days ?? 30) === (cycle === 'yearly' ? 365 : 30),
  );
  const packs = data?.minute_packs?.length ? data.minute_packs : DEFAULT_PACKS;

  const perMinute = (p: PlanDef) => {
    if (!(p.price > 0 && p.monthly_minutes > 0)) return 0;
    const price = p.discounted_price && cycle === 'monthly' ? p.discounted_price : p.price;
    return Math.round(price / (p.period_days === 365 ? p.monthly_minutes * 12 : p.monthly_minutes));
  };

  const rows: [string, (p: PlanDef) => string][] = [
    ['Har 30 kunda', (p) => `${p.monthly_minutes} daqiqa`],
    ['1 daqiqa narxi', (p) => (perMinute(p) ? `~${som(perMinute(p))} soʻm` : '—')],
    ['Video sifati', (p) => `${p.max_resolution ?? '—'} gacha`],
    ['Navbat', (p) => (p.priority ? 'Ustuvor' : 'Umumiy')],
    ['Ovoz variantlari', (p) => ((p.tier ?? p.id) === 'pro' ? 'Tanlash mumkin' : 'Avtomatik')],
    ['Bitta video', () => '120 daqiqagacha'],
    ['Tezkor tahlil', () => 'Daqiqa sarflamaydi'],
  ];

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.hero}>
          <ThemedText accessibilityRole="header" style={styles.h1}>
            Tariflar
          </ThemedText>
          <ThemedText variant="secondary" style={styles.lead}>
            Hisob daqiqada yuritiladi: dublaj ham, subtitr ham videoning haqiqiy davomiyligicha daqiqa sarflaydi. Tezkor tahlil daqiqa
            sarflamaydi.
          </ThemedText>
          {isLoggedIn && current && (
            <View style={[styles.balance, { borderColor: colors.rule, backgroundColor: colors.ground }]}>
              <ThemedText variant="secondary" style={styles.body15}>
                Balansingiz:{' '}
                <ThemedText style={[styles.body15, styles.tabular, { fontWeight: '600' }]}>{current.minutes.total_available} daqiqa</ThemedText>
                {current.minutes.purchased > 0 ? ` · shundan ${current.minutes.purchased} tasi kuymaydi` : ''}
              </ThemedText>
            </View>
          )}
        </View>

        {!isLoggedIn && (
          <View style={[styles.note, { borderColor: colors.rule, backgroundColor: colors.ground }]}>
            <ThemedText variant="secondary" style={[styles.body15, styles.center]}>
              Obuna boʻlish yoki paket olish uchun{' '}
              <ThemedText onPress={() => router.push('/(auth)/login')} suppressHighlighting style={[styles.body15, styles.link, { color: colors.ink }]}>
                kiring
              </ThemedText>{' '}
              yoki{' '}
              <ThemedText onPress={() => router.push('/(auth)/register')} suppressHighlighting style={[styles.body15, styles.link, { color: colors.ink }]}>
                bepul roʻyxatdan oʻting
              </ThemedText>
              .
            </ThemedText>
          </View>
        )}

        <View style={styles.cycle}>
          <SegmentedControl
            options={[
              { value: 'monthly', label: 'Oylik' },
              { value: 'yearly', label: 'Yillik · 2 oy tekin' },
            ]}
            value={cycle}
            onChange={setCycle}
          />
        </View>

        {payment.error && (
          <View style={styles.payError}>
            <Notice>{payment.error}</Notice>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator color={colors.muted} style={styles.loader} />
        ) : (
          <View style={styles.plans}>
            {plans.map((plan) => {
              const tier = plan.tier ?? plan.id;
              const isCurrent = current?.plan === tier;
              const yearly = plan.period_days === 365;
              const shown = plan.discounted_price && cycle === 'monthly' ? plan.discounted_price : yearly ? Math.round(plan.price / 12) : plan.price;
              return (
                <Card key={plan.id} style={[styles.planCard, isCurrent && { borderColor: colors.accent, borderWidth: 2, padding: 23 }]}>
                  <View style={styles.planHead}>
                    <ThemedText accessibilityRole="header" style={styles.planName}>
                      {plan.name.replace(' (yillik)', '')}
                    </ThemedText>
                    {isCurrent && (
                      <View style={[styles.currentTag, { backgroundColor: alpha(colors.accent, 0.1) }]}>
                        <ThemedText style={[styles.xs, { color: colors.accentInk, fontWeight: '500' }]}>Joriy</ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText variant="secondary" style={styles.small}>
                    {PLAN_NOTE[tier] ?? ''}
                  </ThemedText>

                  <View style={styles.mt24}>
                    <ThemedText style={styles.price}>
                      {som(shown)}{' '}
                      <ThemedText variant="secondary" style={styles.priceUnit}>
                        {plan.price === 0 ? 'soʻm' : plan.discounted_price && cycle === 'monthly' ? 'soʻm / oy · −10%' : 'soʻm / oy'}
                      </ThemedText>
                    </ThemedText>
                    {yearly && plan.price > 0 && (
                      <ThemedText variant="secondary" style={[styles.small, styles.tabular, { marginTop: 6 }]}>
                        Yiliga {som(plan.price)} soʻm
                      </ThemedText>
                    )}
                  </View>

                  <View style={styles.mt24}>
                    {isCurrent ? (
                      <PrimaryButton label="Joriy tarifingiz" variant="secondary" onPress={() => {}} />
                    ) : tier === 'free' ? (
                      <PrimaryButton
                        label={isLoggedIn ? 'Video yuborish' : 'Bepul roʻyxatdan oʻtish'}
                        variant="secondary"
                        onPress={() => (isLoggedIn ? router.navigate('/') : router.push('/(auth)/register'))}
                      />
                    ) : (
                      <PrimaryButton
                        label="Obuna boʻlish"
                        loading={payment.pending}
                        onPress={() => (isLoggedIn ? payment.pay({ kind: 'plan', plan: plan.id }) : router.push('/(auth)/login'))}
                      />
                    )}
                  </View>

                  <View style={[styles.rows, { borderTopColor: colors.rule }]}>
                    {rows.map(([label, value], i) => (
                      <View key={label} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.rule }]}>
                        <ThemedText variant="secondary" style={styles.small}>
                          {label}
                        </ThemedText>
                        <ThemedText style={[styles.small, styles.tabular, styles.right]}>{value(plan)}</ThemedText>
                      </View>
                    ))}
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText accessibilityRole="header" style={styles.h2}>
            Bir martalik daqiqalar
          </ThemedText>
          <ThemedText variant="secondary" style={styles.body16}>
            Obunasiz yoki obunaga qoʻshimcha. Sotib olingan daqiqalar hech qachon kuymaydi va obuna tugasa ham saqlanadi.
          </ThemedText>
          <Card style={styles.packs}>
            {packs.map((p, i) => {
              const price = p.discounted_price ?? p.price;
              const bought = !!(p.one_time && p.already_purchased);
              return (
                <View key={p.minutes} style={[styles.pack, i > 0 && { borderTopWidth: 1, borderTopColor: colors.rule }]}>
                  <View style={styles.packTop}>
                    <ThemedText style={[styles.packMinutes, styles.tabular]}>
                      +{p.minutes}{' '}
                      <ThemedText variant="secondary" style={styles.body15}>
                        daqiqa
                      </ThemedText>
                    </ThemedText>
                    <View style={styles.packPrice}>
                      <ThemedText style={[styles.body15, styles.tabular, { fontWeight: '500' }]}>{som(price)} soʻm</ThemedText>
                      <ThemedText variant="secondary" style={[styles.xs13, styles.tabular]}>
                        ~{som(Math.round(price / p.minutes))} soʻm / daqiqa{p.one_time ? ' · faqat bir marta' : ''}
                      </ThemedText>
                    </View>
                  </View>
                  <PrimaryButton
                    label={bought ? 'Olingan' : 'Sotib olish'}
                    variant="secondary"
                    size="sm"
                    disabled={bought}
                    loading={payment.pending}
                    onPress={() => (isLoggedIn ? payment.pay({ kind: 'pack', minutes: p.minutes }) : router.push('/(auth)/login'))}
                  />
                </View>
              );
            })}
          </Card>
        </View>

        <View style={styles.section}>
          <ThemedText accessibilityRole="header" style={styles.h2}>
            Daqiqa qanday sarflanadi
          </ThemedText>
          <View style={styles.rules}>
            {RULES.map(([t, d]) => (
              <View key={t} style={styles.rule}>
                <Check size={16} color={colors.accentInk} strokeWidth={2} style={styles.ruleIcon} />
                <ThemedText variant="secondary" style={[styles.body16, styles.flex]}>
                  <ThemedText style={[styles.body16, { fontWeight: '500' }]}>{t}.</ThemedText> {d}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, styles.lastSection]}>
          <ThemedText accessibilityRole="header" style={styles.h2}>
            Savollar
          </ThemedText>
          <Accordion items={FAQ} style={styles.mt28} />
        </View>
      </View>
      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingTop: 48 },
  hero: { alignItems: 'center' },
  h1: { fontSize: 40, lineHeight: 42, fontWeight: '600', letterSpacing: -1.4, textAlign: 'center' },
  lead: { fontSize: 18, lineHeight: 29, textAlign: 'center', marginTop: 20 },
  balance: { marginTop: 32, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  note: { marginTop: 32, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  center: { textAlign: 'center' },
  link: { fontWeight: '500', textDecorationLine: 'underline' },
  cycle: { marginTop: 40 },
  payError: { marginTop: 16 },
  loader: { marginVertical: 80 },
  plans: { marginTop: 40, gap: 16 },
  planCard: { padding: 24 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 18, fontWeight: '600' },
  currentTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  mt24: { marginTop: 24 },
  mt28: { marginTop: 28 },
  price: { fontSize: 40, lineHeight: 44, fontWeight: '600', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  priceUnit: { fontSize: 15, letterSpacing: 0, fontWeight: '400' },
  rows: { marginTop: 24, borderTopWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingVertical: 10 },
  right: { textAlign: 'right', flexShrink: 1 },
  section: { paddingTop: 96, gap: 12 },
  lastSection: { paddingBottom: 96 },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.6 },
  body15: { fontSize: 15, lineHeight: 22 },
  body16: { fontSize: 16, lineHeight: 26 },
  small: { fontSize: 14, lineHeight: 20 },
  xs: { fontSize: 12 },
  xs13: { fontSize: 13 },
  tabular: { fontVariant: ['tabular-nums'] },
  packs: { padding: 0, marginTop: 28 },
  pack: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  packTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  packMinutes: { fontSize: 18, fontWeight: '600' },
  packPrice: { alignItems: 'flex-end' },
  rules: { marginTop: 20, gap: 24 },
  rule: { flexDirection: 'row', gap: 12 },
  ruleIcon: { marginTop: 5 },
});
