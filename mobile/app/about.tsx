import { useRouter } from 'expo-router';
import { AudioLines, Captions, Languages, Mic, Send, Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Footer } from '../src/components/Footer';
import { PageTitle, SectionTitle } from '../src/components/PageTitle';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { ThemedText } from '../src/components/ThemedText';
import { HowItWorks, StatsStrip } from '../src/features/home/sections';
import { useTheme } from '../src/theme/ThemeProvider';

// frontend/app/about/AboutClient.tsx bilan bir xil tuzilish va matn.
const FACTS = [
  { icon: Mic, title: 'Nutqni aniqlash', text: 'Videodagi gaplar vaqt kodlari bilan matnga aylantiriladi.' },
  { icon: Languages, title: 'Tabiiy tarjima', text: 'Matn sunʼiy intellekt yordamida tabiiy oʻzbek tiliga oʻgiriladi.' },
  { icon: AudioLines, title: 'Mos ovoz', text: 'Spikerning jinsi aniqlanib, unga mos oʻzbekcha ovoz tanlanadi.' },
  { icon: Captions, title: 'Subtitr', text: 'Ovozsiz variant: .srt va .vtt fayllar, oʻzbekcha videolar uchun ham.' },
  { icon: Sparkles, title: 'Tezkor tahlil', text: 'Xulosa, asosiy fikrlar, konspekt va test savollari — daqiqa sarflamaydi.' },
  { icon: Send, title: 'Telegram', text: 'Bot havola yoki videoning oʻzini qabul qiladi, natijani chatga yuboradi.' },
];

export default function AboutScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.page}>
        <PageTitle
          title="GapirAI.uz haqida"
          lead="GapirAI.uz (Gapir AI) — ingliz tilidagi va boshqa xorijiy videolarni oʻzbek tiliga dublyaj (dublaj) qiluvchi onlayn dastur. Maqsadimiz — dunyo bilimlarini har bir oʻzbekzabon uchun ona tilida ochiq qilish."
        >
          <View style={styles.actions}>
            <PrimaryButton label="Video yuborish" fullWidth={false} onPress={() => router.navigate('/')} />
            <PrimaryButton
              label="Ommaviy videolar"
              variant="secondary"
              fullWidth={false}
              onPress={() => router.push('/videos')}
            />
          </View>
        </PageTitle>

        <View style={styles.facts}>
          {FACTS.map(({ icon: Icon, title, text }) => (
            <View key={title}>
              <Icon size={20} color={colors.accentInk} strokeWidth={2} />
              <ThemedText accessibilityRole="header" style={styles.factTitle}>
                {title}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.factText}>
                {text}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      <StatsStrip />
      <HowItWorks />

      <View style={[styles.mission, { borderTopColor: colors.rule }]}>
        <SectionTitle>Nima uchun</SectionTitle>
        <ThemedText variant="secondary" style={styles.missionText}>
          Eng yaxshi maʼruzalar, kurslar va ilmiy-ommabop videolar asosan ingliz va boshqa tillarda. GapirAI.uz ularni brauzerda yoki
          Telegramʼda, hech narsa oʻrnatmasdan, mahalliy toʻlov tizimlari orqali oʻzbek tilida koʻrish imkonini beradi. Natija avtomatik
          tayyorlanadi, shuning uchun tarjima va ovozda kichik xatolar boʻlishi mumkin — fikringizni yozsangiz, tuzatamiz.
        </ThemedText>
      </View>
      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 64 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 32 },
  facts: { marginTop: 64, gap: 40 },
  factTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  factText: { fontSize: 16, lineHeight: 26, marginTop: 6 },
  mission: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 96, gap: 20 },
  missionText: { fontSize: 18, lineHeight: 29 },
});
