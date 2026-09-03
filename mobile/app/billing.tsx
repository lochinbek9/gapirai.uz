import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../src/api/errors';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import * as billingApi from '../src/features/billing/api';
import type { SavedCard } from '../src/features/plans/types';
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

export default function BillingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
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
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.headerAction, { color: colors.accent }]}>{'< Orqaga'}</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Avtomatik to&apos;lov</ThemedText>
          <ThemedView style={{ width: 60, backgroundColor: 'transparent' }} />
        </ThemedView>

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : !ov || !enabledProviders ? (
            <ThemedView
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <ThemedText variant="secondary" style={styles.p}>
                Avtomatik to&apos;lov hozircha mavjud emas. Tez orada kartani bog&apos;lab, obunani va
                daqiqani avtomatik to&apos;ldirish imkoni qo&apos;shiladi.
              </ThemedText>
            </ThemedView>
          ) : (
            <>
              <ThemedText variant="secondary" style={styles.intro}>
                Avtomatik to&apos;lovni gapirai.uz saytida sozlaysiz (karta bog&apos;lash, yoqish). Bu yerda
                holatini ko&apos;rish, kartani o&apos;chirish va avtomatik to&apos;lovni o&apos;chirish
                mumkin.
              </ThemedText>

              {prefs?.in_grace && (
                <ThemedView
                  style={[
                    styles.banner,
                    { borderColor: colors.danger, backgroundColor: colors.danger + '18' },
                  ]}
                >
                  <ThemedText style={{ color: colors.danger, fontSize: 12 }}>
                    Obunani uzaytirib bo&apos;lmadi. Kartangizni tekshiring — yaqin kunlarda qayta urinib
                    ko&apos;ramiz, shu vaqt davomida tarif ishlaydi.
                  </ThemedText>
                </ThemedView>
              )}

              {error && (
                <ThemedView
                  style={[
                    styles.banner,
                    { borderColor: colors.danger, backgroundColor: colors.danger + '18' },
                  ]}
                >
                  <ThemedText style={{ color: colors.danger, fontSize: 12 }}>{error}</ThemedText>
                </ThemedView>
              )}

              {/* Kartalar */}
              <ThemedView
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <ThemedText style={styles.cardTitle}>Kartalar</ThemedText>
                {ov.cards.length === 0 ? (
                  <ThemedText variant="secondary" style={styles.p}>
                    Hali karta bog&apos;lanmagan.
                  </ThemedText>
                ) : (
                  ov.cards.map((c) => (
                    <ThemedView key={c.id} style={[styles.cardRow, { borderColor: colors.border }]}>
                      <ThemedView style={{ flex: 1, backgroundColor: 'transparent' }}>
                        <ThemedText style={styles.cardMask}>
                          {brand(c)} · {c.card_mask || '••••'}
                        </ThemedText>
                        <ThemedText variant="secondary" style={styles.cardSub}>
                          {c.is_active
                            ? c.is_default
                              ? 'asosiy karta'
                              : c.expire || 'faol'
                            : 'tasdiqlanmagan'}
                        </ThemedText>
                      </ThemedView>
                      <Pressable onPress={() => removeCard(c)} hitSlop={6}>
                        <ThemedText style={[styles.rowAction, { color: colors.danger }]}>
                          o&apos;chirish
                        </ThemedText>
                      </Pressable>
                    </ThemedView>
                  ))
                )}
                <PrimaryButton
                  label={hasActiveCard ? 'Saytda boshqarish' : 'Saytda karta bog‘lash'}
                  variant="secondary"
                  onPress={openWeb}
                />
              </ThemedView>

              {/* Sozlamalar */}
              <ThemedView
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <ThemedText style={styles.cardTitle}>Sozlamalar</ThemedText>

                <SettingRow
                  label="Obunani avtomatik uzaytirish"
                  on={!!prefs?.auto_renew}
                  busy={busy}
                  onDisable={() => renewMut.mutate()}
                  onEnableWeb={openWeb}
                  colors={colors}
                />
                <SettingRow
                  label="Daqiqani avtomatik to‘ldirish"
                  on={!!prefs?.auto_topup_enabled}
                  busy={busy}
                  onDisable={() => topupMut.mutate({ enabled: false })}
                  onEnableWeb={openWeb}
                  colors={colors}
                />

                {prefs?.auto_topup_enabled && (
                  <ThemedView style={{ gap: 8, backgroundColor: 'transparent' }}>
                    <ThemedText variant="secondary" style={styles.toggleHint}>
                      Paket hajmi:
                    </ThemedText>
                    <ThemedView style={styles.chipRow}>
                      {PACKS.map((pk) => (
                        <Pressable
                          key={pk ?? 'auto'}
                          onPress={() => topupMut.mutate({ enabled: true, pack: pk })}
                          disabled={busy}
                          style={[
                            styles.chip,
                            { borderColor: colors.border },
                            (prefs.auto_topup_pack ?? null) === pk && {
                              backgroundColor: colors.accent,
                              borderColor: colors.accent,
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.chipText,
                              (prefs.auto_topup_pack ?? null) === pk && { color: '#fff' },
                            ]}
                          >
                            {PACK_LABEL(pk)}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </ThemedView>
                  </ThemedView>
                )}
              </ThemedView>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SettingRow({
  label,
  on,
  busy,
  onDisable,
  onEnableWeb,
  colors,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onDisable: () => void;
  onEnableWeb: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <ThemedView style={styles.toggleRow}>
      <ThemedView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
        {!on && (
          <Pressable onPress={onEnableWeb} hitSlop={4}>
            <ThemedText style={[styles.toggleHint, { color: colors.accent }]}>
              O&apos;chiq · saytda yoqish
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
      {on ? (
        <Switch value={true} disabled={busy} onValueChange={() => onDisable()} />
      ) : (
        <Switch value={false} disabled={busy} onValueChange={() => onEnableWeb()} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerAction: { fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  intro: { fontSize: 12, lineHeight: 18 },
  banner: { borderWidth: 1, borderRadius: 14, padding: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  p: { fontSize: 12, lineHeight: 18 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardMask: { fontSize: 13, fontWeight: '700' },
  cardSub: { fontSize: 11, marginTop: 2 },
  rowAction: { fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  toggleHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
