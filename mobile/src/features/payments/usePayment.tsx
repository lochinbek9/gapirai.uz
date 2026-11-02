import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { Check, ChevronRight, Copy } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../api/errors';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ThemedText } from '../../components/ThemedText';
import { radius } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { formatNumber } from '../../utils/format';
import { initiatePayment, type PaymentProvider, type PaymentStart, type PaymentTarget } from './api';

// Logotiplar -- saytdagi frontend/public/logos bilan bir xil (tizim bir qarashda taniladi)
const PROVIDERS: { id: PaymentProvider; label: string; hint: string; logo: number }[] = [
  { id: 'click', label: 'Click', hint: 'Click ilovasi yoki bank kartasi', logo: require('../../../assets/payments/click.png') },
  { id: 'payme', label: 'Payme', hint: 'Payme ilovasi yoki bank kartasi', logo: require('../../../assets/payments/payme.png') },
  { id: 'uzum', label: 'Uzum', hint: 'Uzum Bank ilovasida', logo: require('../../../assets/payments/uzum.png') },
  { id: 'paynet', label: 'Paynet', hint: 'Paynet ilovasida buyurtma raqami bilan', logo: require('../../../assets/payments/paynet.png') },
];

type Code = Extract<PaymentStart, { kind: 'code' }>;

/**
 * To'lov: provayder tanlanadi (pastdan chiqadigan varaq), so'ng havola tizim orqali
 * ochiladi (Custom Tab emas): my.click.uz, checkout.paycom.uz va uzumbank.uz Android App
 * Link -- telefonda Click/Payme/Uzum ilovasi bo'lsa to'lov o'sha ilovada ochiladi, bo'lmasa
 * brauzerda. Paynet'da ochiq havola formati yo'q -- buyurtma raqami nusxalanib, Paynet
 * ilovasi ochiladi (app.paynet.uz ham App Link), foydalanuvchi raqamni joylashtiradi.
 * Havola ilovadagi sessiya bilan yaratiladi -- saytga qayta kirish shart emas. To'lovdan
 * keyin ilovaga qaytilganda tarif/daqiqa so'rovlari fokusda o'zi yangilanadi.
 * Ishlatish: `const payment = usePayment()` ... `payment.pay(target)` ... `{payment.sheet}`.
 */
export function usePayment() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<PaymentTarget | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ target, provider }: { target: PaymentTarget; provider: PaymentProvider }) => {
      const start = await initiatePayment(target, provider);
      if (start.kind === 'url') {
        await Linking.openURL(start.url);
      } else if (start.kind === 'code') {
        setCode(start);
      } else {
        setNotice(start.message);
        qc.invalidateQueries();
      }
    },
  });

  const choose = (provider: PaymentProvider) => {
    if (!target) return;
    setTarget(null);
    mutation.mutate({ target, provider });
  };

  const sheet = (
    <>
      <PaymentSheet open={!!target} onClose={() => setTarget(null)} onChoose={choose} />
      <CodeSheet code={code} onClose={() => setCode(null)} />
    </>
  );

  return {
    pay: (t: PaymentTarget) => {
      setNotice(null);
      setTarget(t);
    },
    pending: mutation.isPending,
    error: mutation.isError ? getErrorMessage(mutation.error, 'Toʻlovni boshlashda xatolik yuz berdi.') : notice,
    sheet,
  };
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Yopish" />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.rule, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <ThemedText style={styles.sheetTitle}>{title}</ThemedText>
        {children}
      </View>
    </Modal>
  );
}

function PaymentSheet({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (p: PaymentProvider) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Toʻlov usulini tanlang">
      {PROVIDERS.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onChoose(p.id)}
          accessibilityRole="button"
          accessibilityLabel={`${p.label} orqali toʻlash`}
          style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.ground }]}
        >
          <View style={[styles.logoTile, { borderColor: colors.rule }]}>
            <Image source={p.logo} style={styles.logo} contentFit="contain" />
          </View>
          <View style={styles.flex}>
            <ThemedText style={styles.optionLabel}>{p.label}</ThemedText>
            <ThemedText variant="secondary" style={styles.optionHint}>
              {p.hint}
            </ThemedText>
          </View>
          <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
        </Pressable>
      ))}
    </Sheet>
  );
}

// Raqam kiritiladigan ilovalar (App Link -- o'rnatilgan bo'lsa ilova, bo'lmasa sayt ochiladi)
const APP_URL: Record<Code['provider'], string> = { paynet: 'https://app.paynet.uz/', uzum: 'https://uzumbank.uz/' };

/** Saytdagi PaynetOrderCard / UzumAccountCard bilan bir xil matn */
function CodeSheet({ code, onClose }: { code: Code | null; onClose: () => void }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPaynet = code?.provider === 'paynet';
  return (
    <Sheet open={!!code} onClose={onClose} title={isPaynet ? 'Paynet orqali toʻlov' : 'Uzum orqali toʻlov'}>
      {code && (
        <View style={styles.codeBody}>
          <ThemedText variant="secondary" style={styles.codeText}>
            {isPaynet
              ? `Paynet ilovasida yoki bankomatda «GapirAI»ni toping, quyidagi buyurtma raqamini kiriting va ${formatNumber(code.amount)} soʻm toʻlang.`
              : `Uzum Bank ilovasida «GapirAI»ni toping, quyidagi hisob raqamini kiriting va ${formatNumber(code.amount)} soʻm toʻlang.`}
          </ThemedText>
          <Pressable
            onPress={copy}
            accessibilityRole="button"
            accessibilityLabel="Raqamni nusxalash"
            style={[styles.codeBox, { backgroundColor: colors.ground, borderColor: colors.rule }]}
          >
            <ThemedText selectable style={styles.code}>
              {code.code}
            </ThemedText>
            {copied ? <Check size={18} color={colors.green} strokeWidth={2} /> : <Copy size={18} color={colors.muted} strokeWidth={2} />}
          </Pressable>
          <ThemedText variant="secondary" style={styles.codeText}>
            Toʻlov tasdiqlangach daqiqalar hisobingizga avtomatik qoʻshiladi.
          </ThemedText>
          <PrimaryButton
            label={isPaynet ? 'Nusxalash va Paynetʼni ochish' : 'Nusxalash va Uzumʼni ochish'}
            onPress={async () => {
              await copy();
              Linking.openURL(APP_URL[code.provider]).catch(() => {});
            }}
          />
          <PrimaryButton label="Yopish" variant="secondary" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', paddingHorizontal: 12, paddingBottom: 8 },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.tab,
  },
  flex: { flex: 1 },
  // Logotiplar oq fonga mo'ljallangan -- tungi rejimda ham oq plitka
  logoTile: { width: 64, height: 40, borderRadius: 8, borderWidth: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  logo: { width: '100%', height: 22 },
  optionLabel: { fontSize: 15, fontWeight: '500' },
  optionHint: { fontSize: 13, marginTop: 2 },
  codeBody: { paddingHorizontal: 12, gap: 12 },
  codeText: { fontSize: 14, lineHeight: 20 },
  codeBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.control,
  },
  code: { fontSize: 18, fontWeight: '600', letterSpacing: 1, fontVariant: ['tabular-nums'], flexShrink: 1 },
});
