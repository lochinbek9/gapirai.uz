import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { CreditCard, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { getErrorMessage } from '../src/api/errors';
import { Card } from '../src/components/Card';
import { ChoiceTile } from '../src/components/ChoiceTile';
import { Notice } from '../src/components/Notice';
import { PageTitle } from '../src/components/PageTitle';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { RequireAuth } from '../src/components/RequireAuth';
import { Screen } from '../src/components/Screen';
import { ThemedText } from '../src/components/ThemedText';
import { PAYMENTS_ENABLED } from '../src/config/env';
import * as billingApi from '../src/features/billing/api';
import type { SavedCard } from '../src/features/plans/types';
import { alpha, radius } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';

// Variant A: mobil ilovada karta MA'LUMOTLARI kiritilmaydi (App Store 3.1.1).
// Bu yerda faqat avtomatik to'lov HOLATINI ko'rish, kartani o'chirish va
// sozlamalarni O'CHIRISH mumkin. Karta bog'lash / yoqish gapirai.uz saytida.
// To'liq oqim: frontend/components/billing/BillingCard.tsx.

const WEB_BILLING_URL = 'https://gapirai.uz/dashboard';
const PACKS = [null, 30, 60, 120, 300] as const;
const PACK_LABEL = (p: number | null) => (p === null ? 'Avto' : `+${p} daq`);

function brand(c: SavedCard) {
  if (c.card_type === 'humo') return 'Humo';
  if (c.card_type === 'uzcard') return 'UzCard';
  return c.provider === 'payme' ? 'Payme' : 'Click';
}

export default function BillingScreenRoute() {
  // Google Play build'da ilova ichida to'lov sozlamalari yo'q (config/env.ts PAYMENTS_ENABLED)
  if (!PAYMENTS_ENABLED) return <Redirect href="/" />;
  return (
    <RequireAuth>
      <BillingScreen />
    </RequireAuth>
  );
}

function BillingScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: ov, isLoading } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: billingApi.getBillingOverview,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['billing-overview'] });
  const openWeb = () => Linking.openURL(WEB_BILLING_URL).catch(() => {});

  const renewMut = useMutation({
    mutationFn: () => billingApi.setAutoRenew(false),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (e) => setError(getErrorMessage(e, 'Xatolik')),
  });

  const topupMut = useMutation({
    mutationFn: ({ enabled, pack }: { enabled: boolean; pack?: number | null }) =>
      billingApi.setAutoTopup(enabled, pack),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (e) => setError(getErrorMessage(e, 'Xatolik')),
  });

  function removeCard(c: SavedCard) {
    Alert.alert('Kartani o‘chirish', `${brand(c)} · ${c.card_mask || '••••'} o‘chirilsinmi?`, [
      { text: 'Bekor', style: 'cancel' },
      {
        text: "O'chirish",
        style: 'destructive',
        onPress: async () => {
          try {
            await billingApi.deleteCard(c.id);
            refresh();
          } catch (e) {
            setError(getErrorMessage(e, 'Xatolik'));
          }
        },
      },
    ]);
  }

  const enabledProviders = ov ? ov.providers.click || ov.providers.payme : false;
  const prefs = ov?.preferences;
  const hasActiveCard = ov?.cards.some((c) => c.is_active) ?? false;
  const busy = renewMut.isPending || topupMut.isPending;

  return (
    <Screen contentStyle={styles.content}>
      <PageTitle
        title="Avtomatik toʻlov"
        lead="Kartani bogʻlash va yoqish gapirai.uz saytida. Bu yerda holatini koʻrish, kartani oʻchirish va avtomatik toʻlovni oʻchirish mumkin."
      />

      {isLoading ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : !ov || !enabledProviders ? (
        <Notice tone="neutral">
          Avtomatik toʻlov hozircha mavjud emas. Tez orada kartani bogʻlab, obunani va daqiqani avtomatik toʻldirish imkoni qoʻshiladi.
        </Notice>
      ) : (
        <>
          {prefs?.in_grace && (
            <Notice>
              Obunani uzaytirib boʻlmadi. Kartangizni tekshiring — yaqin kunlarda qayta urinib koʻramiz, shu vaqt davomida tarif ishlaydi.
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}

          <Card style={styles.card}>
            <ThemedText accessibilityRole="header" style={styles.cardTitle}>
              Kartalar
            </ThemedText>
            {ov.cards.length === 0 ? (
              <ThemedText variant="secondary" style={styles.p}>
                Hali karta bogʻlanmagan.
              </ThemedText>
            ) : (
              ov.cards.map((c) => (
                <View key={c.id} style={[styles.cardRow, { borderColor: colors.rule }]}>
                  <CreditCard size={20} color={colors.muted} strokeWidth={2} />
                  <View style={styles.flex}>
                    <ThemedText style={styles.cardMask}>
                      {brand(c)} · {c.card_mask || '••••'}
                    </ThemedText>
                    <ThemedText variant="secondary" style={styles.cardSub}>
                      {c.is_active ? (c.is_default ? 'asosiy karta' : c.expire || 'faol') : 'tasdiqlanmagan'}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => removeCard(c)}
                    accessibilityRole="button"
                    accessibilityLabel="Kartani oʻchirish"
                    hitSlop={6}
                    style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: alpha(colors.red, 0.1) }]}
                  >
                    <Trash2 size={16} color={colors.muted} strokeWidth={2} />
                  </Pressable>
                </View>
              ))
            )}
            <PrimaryButton label={hasActiveCard ? 'Saytda boshqarish' : 'Saytda karta bogʻlash'} variant="secondary" onPress={openWeb} />
          </Card>

          <Card style={styles.card}>
            <ThemedText accessibilityRole="header" style={styles.cardTitle}>
              Sozlamalar
            </ThemedText>
            <SettingRow
              label="Obunani avtomatik uzaytirish"
              on={!!prefs?.auto_renew}
              busy={busy}
              onDisable={() => renewMut.mutate()}
              onEnableWeb={openWeb}
            />
            <View style={[styles.divider, { backgroundColor: colors.rule }]} />
            <SettingRow
              label="Daqiqani avtomatik toʻldirish"
              on={!!prefs?.auto_topup_enabled}
              busy={busy}
              onDisable={() => topupMut.mutate({ enabled: false })}
              onEnableWeb={openWeb}
            />
            {prefs?.auto_topup_enabled && (
              <View style={styles.packs}>
                <ThemedText style={styles.label}>Paket hajmi</ThemedText>
                <View style={styles.chipRow}>
                  {PACKS.map((pk) => (
                    <ChoiceTile
                      key={pk ?? 'auto'}
                      title={PACK_LABEL(pk)}
                      selected={(prefs.auto_topup_pack ?? null) === pk}
                      onPress={() => !busy && topupMut.mutate({ enabled: true, pack: pk })}
                      style={styles.chip}
                    />
                  ))}
                </View>
              </View>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function SettingRow({
  label,
  on,
  busy,
  onDisable,
  onEnableWeb,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onDisable: () => void;
  onEnableWeb: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
        <ThemedText variant="secondary" style={styles.toggleHint}>
          {on ? 'Yoqilgan' : 'Oʻchiq · saytda yoqish mumkin'}
        </ThemedText>
      </View>
      <Switch
        value={on}
        disabled={busy}
        onValueChange={() => (on ? onDisable() : onEnableWeb())}
        trackColor={{ false: colors.rule, true: colors.accent }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 96, gap: 16 },
  loader: { marginTop: 40 },
  card: { gap: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  p: { fontSize: 14, lineHeight: 20 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.control, paddingLeft: 14, paddingRight: 6, paddingVertical: 10 },
  cardMask: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  cardSub: { fontSize: 13, marginTop: 2 },
  iconBtn: { padding: 8, borderRadius: radius.tab },
  divider: { height: 1 },
  packs: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 0, paddingVertical: 8, paddingHorizontal: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  toggleHint: { fontSize: 13, marginTop: 2 },
});
