import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../src/api/errors';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ThemedText } from '../src/components/ThemedText';
import { ThemedTextInput } from '../src/components/ThemedTextInput';
import { ThemedView } from '../src/components/ThemedView';
import * as billingApi from '../src/features/billing/api';
import type { SavedCard } from '../src/features/plans/types';
import { useTheme } from '../src/theme/ThemeProvider';

// Mirrors frontend/components/billing/BillingCard.tsx — bog'langan kartalar +
// obunani/daqiqani avtomatik to'ldirish. Provayder serverda yoqilmagan bo'lsa
// (CLICK_CARD_TOKEN_ENABLED / PAYME_CARD_TOKEN_ENABLED) bo'lim ko'rsatilmaydi.

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

  // add-card flow
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<'click' | 'payme'>('click');
  const [number, setNumber] = useState('');
  const [expire, setExpire] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<{ id: string; phone: string | null } | null>(null);
  const [code, setCode] = useState('');

  const enabledProviders = useMemo(
    () =>
      ov
        ? (Object.entries(ov.providers)
            .filter(([, v]) => v)
            .map(([k]) => k) as ('click' | 'payme')[])
        : [],
    [ov],
  );

  const bindMut = useMutation({
    mutationFn: () => billingApi.bindCard(provider, number.replace(/\s/g, ''), expire.replace(/\s/g, '')),
    onMutate: () => setError(null),
    onSuccess: (res) => {
      if (res.needs_code) {
        setPending({ id: res.card.id, phone: res.phone_hint });
      } else {
        resetForm();
        refresh();
      }
    },
    onError: (e) => setError(getErrorMessage(e, "Kartani bog'lab bo'lmadi.")),
  });

  const verifyMut = useMutation({
    mutationFn: () => billingApi.verifyCard(pending!.id, code.trim()),
    onMutate: () => setError(null),
    onSuccess: () => {
      resetForm();
      refresh();
    },
    onError: (e) => setError(getErrorMessage(e, 'Kod tasdiqlanmadi.')),
  });

  const renewMut = useMutation({
    mutationFn: (enabled: boolean) => billingApi.setAutoRenew(enabled),
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

  function resetForm() {
    setAdding(false);
    setNumber('');
    setExpire('');
    setConsent(false);
    setPending(null);
    setCode('');
    setError(null);
  }

  async function doBind() {
    if (!consent) {
      setError("Avtomatik to'lovga rozilikni belgilang.");
      return;
    }
    bindMut.mutate();
  }

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

  async function makeDefault(c: SavedCard) {
    try {
      await billingApi.setDefaultCard(c.id);
      refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'Xatolik'));
    }
  }

  const prefs = ov?.preferences;
  const activeCards = ov?.cards.filter((c) => c.is_active) ?? [];
  const canRenew = !!(ov?.current_plan_paid || prefs?.auto_renew_plan);
  const busy = bindMut.isPending || verifyMut.isPending || renewMut.isPending || topupMut.isPending;

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
          ) : !ov || enabledProviders.length === 0 ? (
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
                Kartani bog&apos;lab, obuna muddati tugaganda yoki daqiqa balansi qolmaganda to&apos;lovni
                avtomatik amalga oshiring. Karta ma&apos;lumotlari to&apos;lov tizimida (Click/Payme)
                saqlanadi — GapirAI.uz ularni ko&apos;rmaydi.
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

              {/* Saqlangan kartalar */}
              <ThemedView
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <ThemedText style={styles.cardTitle}>Kartalar</ThemedText>
                {ov.cards.length === 0 && (
                  <ThemedText variant="secondary" style={styles.p}>
                    Hali karta bog&apos;lanmagan.
                  </ThemedText>
                )}
                {ov.cards.map((c) => (
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
                    {c.is_active && !c.is_default && (
                      <Pressable onPress={() => makeDefault(c)} hitSlop={6}>
                        <ThemedText style={[styles.rowAction, { color: colors.accent }]}>asosiy</ThemedText>
                      </Pressable>
                    )}
                    <Pressable onPress={() => removeCard(c)} hitSlop={6}>
                      <ThemedText style={[styles.rowAction, { color: colors.danger }]}>
                        o&apos;chirish
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                ))}

                {!adding && !pending && (
                  <Pressable onPress={() => setAdding(true)}>
                    <ThemedText style={[styles.addLink, { color: colors.accent }]}>
                      + Karta bog&apos;lash
                    </ThemedText>
                  </Pressable>
                )}

                {adding && !pending && (
                  <ThemedView style={styles.form}>
                    {enabledProviders.length > 1 && (
                      <ThemedView style={styles.chipRow}>
                        {enabledProviders.map((p) => (
                          <Pressable
                            key={p}
                            onPress={() => setProvider(p)}
                            style={[
                              styles.chip,
                              { borderColor: colors.border },
                              provider === p && {
                                backgroundColor: colors.accent,
                                borderColor: colors.accent,
                              },
                            ]}
                          >
                            <ThemedText style={[styles.chipText, provider === p && { color: '#fff' }]}>
                              {p === 'payme' ? 'Payme' : 'Click'}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ThemedView>
                    )}
                    <ThemedTextInput
                      label="Karta raqami"
                      value={number}
                      onChangeText={(t) => setNumber(t.replace(/[^\d ]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="8600 •••• •••• ••••"
                      maxLength={23}
                    />
                    <ThemedTextInput
                      label="Amal muddati (MM/YY)"
                      value={expire}
                      onChangeText={(t) => setExpire(t.replace(/[^\d/]/g, '').slice(0, 5))}
                      keyboardType="number-pad"
                      placeholder="MM/YY"
                      maxLength={5}
                    />
                    <Pressable style={styles.consentRow} onPress={() => setConsent((v) => !v)}>
                      <Switch value={consent} onValueChange={setConsent} />
                      <ThemedText variant="secondary" style={styles.consentText}>
                        Kartani bog&apos;lashga va obunam/daqiqam tugaganda undan avtomatik to&apos;lov
                        yechilishiga rozilik beraman. Istalgan vaqtda o&apos;chira olaman.
                      </ThemedText>
                    </Pressable>
                    <PrimaryButton
                      label="SMS kod olish"
                      onPress={doBind}
                      loading={bindMut.isPending}
                      disabled={!number || !expire || busy}
                    />
                    <PrimaryButton label="Bekor" variant="secondary" onPress={resetForm} />
                  </ThemedView>
                )}

                {pending && (
                  <ThemedView style={styles.form}>
                    <ThemedText variant="secondary" style={styles.p}>
                      {pending.phone ? `${pending.phone} raqamiga` : 'Telefoningizga'} yuborilgan SMS kodni
                      kiriting.
                    </ThemedText>
                    <ThemedTextInput
                      label="SMS kod"
                      value={code}
                      onChangeText={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 8))}
                      keyboardType="number-pad"
                      placeholder="•••••"
                    />
                    <PrimaryButton
                      label="Tasdiqlash"
                      onPress={() => verifyMut.mutate()}
                      loading={verifyMut.isPending}
                      disabled={code.length < 3 || busy}
                    />
                    <ThemedView style={styles.pendingActions}>
                      <Pressable
                        onPress={() =>
                          pending &&
                          billingApi
                            .resendCardCode(pending.id)
                            .then((r) => setPending({ id: pending.id, phone: r.phone_hint }))
                            .catch(() => {})
                        }
                      >
                        <ThemedText style={[styles.rowAction, { color: colors.accent }]}>
                          Qayta yuborish
                        </ThemedText>
                      </Pressable>
                      <Pressable onPress={resetForm}>
                        <ThemedText style={[styles.rowAction, { color: colors.textSecondary }]}>
                          Bekor
                        </ThemedText>
                      </Pressable>
                    </ThemedView>
                  </ThemedView>
                )}
              </ThemedView>

              {/* Sozlamalar */}
              {activeCards.length > 0 && prefs && (
                <ThemedView
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <ThemedText style={styles.cardTitle}>Sozlamalar</ThemedText>

                  <ThemedView style={styles.toggleRow}>
                    <ThemedView style={{ flex: 1, backgroundColor: 'transparent' }}>
                      <ThemedText style={styles.toggleLabel}>Obunani avtomatik uzaytirish</ThemedText>
                      <ThemedText variant="secondary" style={styles.toggleHint}>
                        {canRenew ? "Tarif tugaganda kartadan to'lanadi" : 'Faol pullik obuna kerak'}
                      </ThemedText>
                    </ThemedView>
                    <Switch
                      value={prefs.auto_renew}
                      disabled={!canRenew || busy}
                      onValueChange={(v) => renewMut.mutate(v)}
                    />
                  </ThemedView>

                  <ThemedView style={styles.toggleRow}>
                    <ThemedView style={{ flex: 1, backgroundColor: 'transparent' }}>
                      <ThemedText style={styles.toggleLabel}>Daqiqani avtomatik to&apos;ldirish</ThemedText>
                      <ThemedText variant="secondary" style={styles.toggleHint}>
                        Balans yetmasa, video to&apos;xtamasligi uchun paket avtomatik sotib olinadi
                      </ThemedText>
                    </ThemedView>
                    <Switch
                      value={prefs.auto_topup_enabled}
                      disabled={busy}
                      onValueChange={(v) => topupMut.mutate({ enabled: v, pack: prefs.auto_topup_pack })}
                    />
                  </ThemedView>

                  {prefs.auto_topup_enabled && (
                    <ThemedView style={styles.chipRow}>
                      {PACKS.map((p) => (
                        <Pressable
                          key={p ?? 'auto'}
                          onPress={() => topupMut.mutate({ enabled: true, pack: p })}
                          disabled={busy}
                          style={[
                            styles.chip,
                            { borderColor: colors.border },
                            (prefs.auto_topup_pack ?? null) === p && {
                              backgroundColor: colors.accent,
                              borderColor: colors.accent,
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.chipText,
                              (prefs.auto_topup_pack ?? null) === p && { color: '#fff' },
                            ]}
                          >
                            {PACK_LABEL(p)}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </ThemedView>
                  )}
                </ThemedView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
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
  addLink: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  form: { gap: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: '700' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consentText: { flex: 1, fontSize: 11, lineHeight: 16 },
  pendingActions: { flexDirection: 'row', justifyContent: 'space-between' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  toggleHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
