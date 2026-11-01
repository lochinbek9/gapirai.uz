import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { ThemedText } from '../src/components/ThemedText';
import { AnalyzeForm } from '../src/features/analysis/components/AnalyzeForm';
import { DubForm } from '../src/features/dubbing/components/DubForm';
import { SERVICES, type ServiceId } from '../src/features/home/sections';
import { useAuthStore } from '../src/store/useAuthStore';
import { radius } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';

const SERVICE_OPTIONS = (Object.keys(SERVICES) as ServiceId[]).map((id) => ({ value: id, label: SERVICES[id].name, icon: SERVICES[id].icon }));

/** Ilovaning bosh ekrani: saytdagi reklama bo'limlarisiz -- qisqa sarlavha va ishchi forma.
 *  (Statistika, "Qanday ishlaydi", Telegram, footer saytda qoladi; ilovada chalg'itadi -- egasi 2026-11-01.) */
export default function HomeScreen() {
  const signedOut = useAuthStore((s) => s.status === 'signedOut');
  const [mode, setMode] = useState<ServiceId>('dub');
  const [offerClosed, setOfferClosed] = useState(false);

  return (
    <Screen back={false} contentStyle={styles.content}>
      <View>
        <ThemedText accessibilityRole="header" style={styles.h1}>
          Dunyo bilimlari oʻzbek tilida
        </ThemedText>
        <ThemedText variant="secondary" style={styles.lead}>
          YouTube havolasi yoki videongizni yuboring — oʻzbekcha ovoz, subtitr yoki konspekt boʻlib qaytadi.
        </ThemedText>
      </View>

      <View style={styles.form}>
        <SegmentedControl options={SERVICE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'analyze' ? <AnalyzeForm /> : <DubForm key={mode} mode={mode} />}
      </View>

      {signedOut && !offerClosed && <SignUpOffer onClose={() => setOfferClosed(true)} />}
    </Screen>
  );
}

/** Kirmagan foydalanuvchiga taklif: forma ostida, yopiladigan, bitta asosiy tugma. */
function SignUpOffer({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.offer, { backgroundColor: colors.ground }]} accessibilityLabel="Roʻyxatdan oʻtish taklifi">
      <View style={styles.offerHead}>
        <View style={styles.flex}>
          <ThemedText style={styles.offerTitle}>Bepul hisob oching</ThemedText>
          <ThemedText variant="secondary" style={styles.offerText}>
            Videolaringiz saqlanadi va har 30 kunda 5 daqiqa bepul.
          </ThemedText>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Taklifni yopish"
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && { backgroundColor: colors.rule }]}
        >
          <X size={18} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </View>
      <PrimaryButton label="Roʻyxatdan oʻtish" onPress={() => router.push('/(auth)/register')} />
      <View style={styles.loginRow}>
        <ThemedText variant="secondary" style={styles.offerText}>
          Hisobingiz bormi?
        </ThemedText>
        <Pressable onPress={() => router.push('/(auth)/login')} accessibilityRole="link" hitSlop={10}>
          <ThemedText style={[styles.offerText, styles.loginLink, { color: colors.accentInk }]}>Kirish</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 24 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7 },
  lead: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  form: { gap: 20 },
  offer: { borderRadius: radius.card, padding: 16, gap: 16 },
  offerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  offerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  offerText: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: radius.tab, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: -4 },
  loginLink: { fontWeight: '600' },
});
