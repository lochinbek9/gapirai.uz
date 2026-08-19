import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../src/components/PrimaryButton';
import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import { useTheme } from '../src/theme/ThemeProvider';

// Content mirrors frontend/app/about/AboutClient.tsx (condensed for mobile —
// no motion/animation, no icon library dependency, same copy).
const FEATURES = [
  {
    title: 'Avtomatik va Tezkor',
    body: "Hech qanday qo'lda ishlov berish talab etilmaydi. YouTube havolasini kiritasiz va platformamiz avtomatik ravishda videoni yuklaydi, ovozini ajratadi va o'zbek tiliga dublyaj qiladi.",
  },
  {
    title: 'Whisper + GPT-4o Texnologiyasi',
    body: "OpenAI Whisper orqali nutq aniq matnga o'tkaziladi. GPT-4o esa o'zbek tilining boy va oqilona grammatikasiga mos holda matnni yuqori aniqlikda tarjima qiladi.",
  },
  {
    title: 'Tabiiy Ovozlar (TTS)',
    body: "Azure Speech Neural texnologiyasi asosida erkak va ayol ovozlari tanlanadi yoki AI avtomatik tarzda so'zlovchining jinsini aniqlab unga mos tabiiy ovoz beradi.",
  },
  {
    title: 'Xavfsiz va Qulay Boshqaruv',
    body: "Tayyorlangan barcha dublyaj qilingan videolaringiz shaxsiy panelingizda tartibli saqlanadi. Istalgan vaqtda ko'rishingiz va yuklab olishingiz mumkin.",
  },
];

export default function AboutScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.headerAction, { color: colors.accent }]}>{'< Orqaga'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedView style={[styles.eyebrow, { backgroundColor: colors.accentGlow }]}>
              <ThemedText style={[styles.eyebrowText, { color: colors.accent }]}>Innovatsion Platforma</ThemedText>
            </ThemedView>
            <ThemedText style={styles.heroTitle}>
              GapirAI<ThemedText style={[styles.heroTitle, { color: colors.accent }]}>.uz</ThemedText> haqida
            </ThemedText>
            <ThemedText variant="secondary" style={styles.heroBody}>
              GapirAI.uz (Gapir AI) — bu YouTube va turli manbalardagi videolarni Sun&apos;iy Intellekt (AI)
              texnologiyalari yordamida soniyalar ichida avtomatik tarzda o&apos;zbek tiliga dublyaj va
              tarjima qilib beruvchi eng ilg&apos;or milliy dublyaj platformasidir.
            </ThemedText>
            <PrimaryButton label="Dublyajni sinab ko'rish" onPress={() => router.push('/')} />
          </ThemedView>

          {FEATURES.map((f) => (
            <ThemedView
              key={f.title}
              style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <ThemedText style={styles.featureTitle}>{f.title}</ThemedText>
              <ThemedText variant="secondary" style={styles.featureBody}>
                {f.body}
              </ThemedText>
            </ThemedView>
          ))}

          <ThemedView style={[styles.missionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText style={styles.featureTitle}>Bizning Maqsadimiz</ThemedText>
            <ThemedText variant="secondary" style={styles.featureBody}>
              Jahon ilmiy-ma&apos;rifiy va ko&apos;ngilochar video kontentlarini har bir o&apos;zbekzabon
              foydalanuvchi uchun o&apos;z ona tilida qulay va tushunarli qilishdir. Sun&apos;iy intellekt
              kuchi bilan til to&apos;siqlarini olib tashlash va bilimlarni o&apos;zbek tilida keng yoyish
              loyihamizning bosh g&apos;oyasidir.
            </ThemedText>
            <ThemedView style={styles.badgeRow}>
              {['100% Avtomatik', 'Aniq Tarjima', 'HD Ovoz va Video'].map((b) => (
                <ThemedText key={b} style={[styles.badge, { color: colors.accent }]}>
                  {'✓ '}
                  {b}
                </ThemedText>
              ))}
            </ThemedView>
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  hero: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 12, alignItems: 'center' },
  eyebrow: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  eyebrowText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: 26, fontWeight: '900', textAlign: 'center' },
  heroBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  featureCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 6 },
  featureTitle: { fontSize: 15, fontWeight: '800' },
  featureBody: { fontSize: 12, lineHeight: 18 },
  missionCard: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 12 },
  badgeRow: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  badge: { fontSize: 12, fontWeight: '700' },
});
