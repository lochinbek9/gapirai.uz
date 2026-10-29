import { useRouter } from 'expo-router';
import { LogIn, UserPlus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ScrollView } from 'react-native';

import { Card } from '../src/components/Card';
import { Footer } from '../src/components/Footer';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { ThemedText } from '../src/components/ThemedText';
import { AnalyzeForm } from '../src/features/analysis/components/AnalyzeForm';
import { DubForm } from '../src/features/dubbing/components/DubForm';
import { AboutSection, HowItWorks, SERVICES, Services, StatsStrip, TelegramSection, type ServiceId } from '../src/features/home/sections';
import { useAuthStore } from '../src/store/useAuthStore';
import { radius } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';

const SERVICE_OPTIONS = (Object.keys(SERVICES) as ServiceId[]).map((id) => ({ value: id, label: SERVICES[id].name, icon: SERVICES[id].icon }));

/** Saytdagi bosh sahifa (frontend/app/page.tsx) bilan bir xil tuzilish. */
export default function HomeScreen() {
  const signedOut = useAuthStore((s) => s.status === 'signedOut');
  const [mode, setMode] = useState<ServiceId>('dub');
  const [welcomeClosed, setWelcomeClosed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const heroY = useRef(0);
  const formY = useRef(0);

  // Xizmatni tanlash: rejim almashadi va forma ko'rinadigan joyga o'tiladi
  const pickService = (id: ServiceId) => {
    setMode(id);
    scrollRef.current?.scrollTo({ y: Math.max(0, heroY.current + formY.current - 16), animated: true });
  };

  return (
    <Screen scrollRef={scrollRef} back={false}>
      {signedOut && !welcomeClosed && <WelcomeStrip onClose={() => setWelcomeClosed(true)} />}

      <View style={styles.hero} onLayout={(e) => (heroY.current = e.nativeEvent.layout.y)}>
        <ThemedText accessibilityRole="header" style={styles.h1}>
          Dunyo bilimlari oʻzbek tilida
        </ThemedText>
        <ThemedText variant="secondary" style={styles.lead}>
          YouTube havolasini yoki videongizni yuboring — u oʻzbekcha ovoz, subtitr yoki qisqa konspekt boʻlib qaytadi. Har 30 kunda 5
          daqiqa bepul.
        </ThemedText>

        <View onLayout={(e) => (formY.current = e.nativeEvent.layout.y)} style={styles.formWrap}>
          <Card raised>
            <View style={styles.tabs}>
              <SegmentedControl options={SERVICE_OPTIONS} value={mode} onChange={setMode} />
            </View>
            {mode === 'analyze' ? <AnalyzeForm /> : <DubForm key={mode} mode={mode} />}
          </Card>
        </View>
      </View>

      <StatsStrip />
      <Services active={mode} onPick={pickService} />
      <HowItWorks />
      <TelegramSection />
      <AboutSection />
      <Footer />
    </Screen>
  );
}

/** Birinchi tashrif: ro'yxatdan o'tish taklifi -- ekranni to'smaydigan, yopiladigan qator. */
function WelcomeStrip({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.welcome, { borderBottomColor: colors.rule }]} accessibilityLabel="Roʻyxatdan oʻtish taklifi">
      <ThemedText variant="secondary" style={styles.welcomeText}>
        <ThemedText style={[styles.welcomeText, { fontWeight: '500' }]}>Bepul hisob oching</ThemedText> — videolaringiz saqlanadi va har
        30 kunda 5 daqiqa bepul.
      </ThemedText>
      <View style={styles.welcomeActions}>
        <PrimaryButton label="Roʻyxatdan oʻtish" icon={UserPlus} onPress={() => router.push('/(auth)/register')} style={styles.flex} />
        <PrimaryButton label="Kirish" icon={LogIn} variant="secondary" fullWidth={false} onPress={() => router.push('/(auth)/login')} />
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Taklifni yopish"
          style={({ pressed }) => [styles.close, pressed && { backgroundColor: colors.ground }]}
        >
          <X size={20} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 80 },
  h1: { fontSize: 40, lineHeight: 42, fontWeight: '600', letterSpacing: -1.4, textAlign: 'center' },
  lead: { fontSize: 18, lineHeight: 29, textAlign: 'center', marginTop: 20 },
  formWrap: { marginTop: 40 },
  tabs: { marginBottom: 20 },
  welcome: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  welcomeText: { fontSize: 15, lineHeight: 22 },
  welcomeActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  close: { width: 40, height: 40, borderRadius: radius.tab, alignItems: 'center', justifyContent: 'center' },
});
