import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { AudioLines, Captions, Check, Send, Sparkles, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '../../components/Card';
import { SectionTitle } from '../../components/PageTitle';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ThemedText } from '../../components/ThemedText';
import { radius } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { formatNumber as fmt } from '../../utils/format';
import { getPublicStats, type PublicStats } from './api';

export type ServiceId = 'dub' | 'subtitle' | 'analyze';

export const SERVICES: Record<ServiceId, { name: string; icon: LucideIcon }> = {
  dub: { name: 'Dublyaj', icon: AudioLines },
  subtitle: { name: 'Subtitr', icon: Captions },
  analyze: { name: 'Tahlil', icon: Sparkles },
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const STAT_ITEMS: { key: keyof PublicStats; label: string }[] = [
  { key: 'dubs', label: 'video oʻzbek tiliga oʻgirildi' },
  { key: 'minutes', label: 'daqiqa oʻzbekcha ovozga aylantirildi' },
  { key: 'users', label: 'foydalanuvchi roʻyxatdan oʻtgan' },
];

/** Jonli raqamlar (/api/public-stats). Javob bo'lmasa bo'lim ko'rsatilmaydi -- taxminiy raqam chiqarmaymiz. */
export function StatsStrip() {
  const { colors } = useTheme();
  const { data, isError } = useQuery({ queryKey: ['public-stats'], queryFn: getPublicStats, staleTime: 5 * 60_000 });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!data) return;
    let frame = 0;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return setProgress(1);
      const start = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / 1600);
        setProgress(t);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [data]);

  if (isError) return null;

  return (
    <View style={[styles.band, { backgroundColor: colors.ground, borderColor: colors.rule }]} accessibilityLabel="Platforma raqamlarda">
      {STAT_ITEMS.map(({ key, label }) => {
        const value = data?.[key];
        return (
          <View key={key} accessibilityLabel={value !== undefined ? `${fmt(value)} ${label}` : undefined}>
            <ThemedText style={[styles.statValue, value === undefined && { color: colors.rule }]}>
              {value === undefined ? '—' : fmt(Math.round(value * easeOutExpo(progress)))}
            </ThemedText>
            <ThemedText variant="secondary" style={styles.statLabel}>
              {label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const SERVICE_ROWS: { id: ServiceId; title: string; detail: string; gets: string[]; cost: string; action: string }[] = [
  {
    id: 'dub',
    title: 'Oʻzbekcha ovozli video',
    detail: 'Nutq tarjima qilinib, spikerning jinsiga mos oʻzbekcha ovoz bilan qayta yoziladi.',
    gets: ['MP4 video', 'Ilovadagi pleyerda subtitr', 'Qayta yaratish imkoni'],
    cost: 'Video davomiyligicha daqiqa',
    action: 'Dublajni boshlash',
  },
  {
    id: 'subtitle',
    title: 'Oʻzbekcha subtitr',
    detail: 'Ovozsiz, tezroq. Video oʻzbek tilida boʻlsa — tarjimasiz, faqat matnga aylantiriladi.',
    gets: ['.srt va .vtt fayllar', 'Vaqt kodlari bilan', 'YouTube havola yoki fayl'],
    cost: 'Video davomiyligicha daqiqa',
    action: 'Subtitr yaratish',
  },
  {
    id: 'analyze',
    title: 'Video tahlili',
    detail: 'Uzun maʼruza yoki kursni koʻrishdan oldin qisqa koʻrinishda oling.',
    gets: ['Xulosa va asosiy fikrlar', 'Konspekt', 'Test savollari'],
    cost: 'Daqiqa sarflamaydi',
    action: 'Tahlil qilish',
  },
];

export function Services({ active, onPick }: { active: ServiceId; onPick: (id: ServiceId) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <SectionTitle lead="Kerakli natijani tanlang: ovozli video, subtitr yoki qisqa tahlil.">Bitta havola — uch xil natija</SectionTitle>
      <View style={styles.stack16}>
        {SERVICE_ROWS.map((row) => {
          const Icon = SERVICES[row.id].icon;
          const isActive = active === row.id;
          return (
            <Card key={row.id} style={[styles.serviceCard, isActive && { borderColor: colors.accent, borderWidth: 2, padding: 23 }]}>
              <View style={styles.serviceTag}>
                <Icon size={16} color={colors.accentInk} strokeWidth={2} />
                <ThemedText variant="secondary" style={styles.serviceTagText}>
                  {SERVICES[row.id].name}
                </ThemedText>
              </View>
              <ThemedText accessibilityRole="header" style={styles.serviceTitle}>
                {row.title}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.body}>
                {row.detail}
              </ThemedText>
              <View style={styles.gets}>
                {row.gets.map((g) => (
                  <View key={g} style={styles.getRow}>
                    <Check size={16} color={colors.accentInk} strokeWidth={2} />
                    <ThemedText style={styles.getText}>{g}</ThemedText>
                  </View>
                ))}
              </View>
              <View style={[styles.cost, { borderTopColor: colors.rule }]}>
                <ThemedText variant="secondary" style={styles.getText}>
                  Narx: <ThemedText style={[styles.getText, { fontWeight: '500' }]}>{row.cost}</ThemedText>
                </ThemedText>
              </View>
              <PrimaryButton label={row.action} variant={isActive ? 'primary' : 'secondary'} onPress={() => onPick(row.id)} style={styles.mt20} />
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const STEPS: [string, string][] = [
  ['Havolani qoʻying', 'YouTube havolasi yoki qurilmangizdagi video. Bitta video 120 daqiqagacha.'],
  ['Nutq aniqlanadi', 'Gaplar matnga aylanadi, spikerning ovozi erkak yoki ayol ekani aniqlanadi.'],
  ['Tarjima va ovoz', 'Matn tabiiy oʻzbek tiliga oʻgiriladi va video vaqtiga mos ovozlashtiriladi.'],
  ['Tayyor', 'Videoni ilovada koʻring yoki MP4 qilib yuklab oling. Jarayon sahifada koʻrinib turadi.'],
];

/** Tartib maʼlumot tashiydi (har bosqich oldingisiga bogʻliq), shuning uchun raqamlar bor. */
export function HowItWorks() {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, styles.bandTop, { backgroundColor: colors.ground, borderTopColor: colors.rule }]}>
      <SectionTitle>Havoladan tayyor videogacha</SectionTitle>
      <View style={styles.steps}>
        {STEPS.map(([title, text], i) => (
          <View key={title}>
            <View style={[styles.stepNum, { borderColor: colors.rule, backgroundColor: colors.surface }]}>
              <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
            </View>
            <ThemedText accessibilityRole="header" style={styles.stepTitle}>
              {title}
            </ThemedText>
            <ThemedText variant="secondary" style={[styles.body, styles.mt8]}>
              {text}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Saytdagi TelegramSection: siyoh rangli blok (qorong'i mavzuda -- ground + chiziq). */
export function TelegramSection() {
  const { colors, mode } = useTheme();
  const dark = mode === 'dark';
  const fg = dark ? colors.ink : colors.darkInk;
  return (
    <View style={styles.section}>
      <View
        style={[
          styles.tgBlock,
          dark ? { backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.rule } : { backgroundColor: colors.dark },
        ]}
      >
        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: fg }]}>
          Telegram orqali ham
        </ThemedText>
        <ThemedText style={[styles.tgText, { color: fg }]}>
          Botga YouTube havolasini yoki videoning oʻzini yuboring — dublaj tayyor boʻlgach, natija oʻsha chatga keladi.
        </ThemedText>
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync('https://t.me/gapirai_uz_bot').catch(() => {})}
          accessibilityRole="link"
          style={({ pressed }) => [styles.tgButton, { opacity: pressed ? 0.9 : 1 }]}
        >
          <Send size={16} color="#0B0D12" strokeWidth={2} />
          <ThemedText style={styles.tgButtonText}>@gapirai_uz_bot ni ochish</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export function AboutSection() {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, styles.bandTop, { borderTopColor: colors.rule }]}>
      <SectionTitle>GapirAI.uz haqida</SectionTitle>
      <ThemedText variant="secondary" style={styles.aboutText}>
        <ThemedText style={[styles.aboutText, { fontWeight: '500' }]}>GapirAI.uz</ThemedText> (Gapir AI) — ingliz tilidagi va boshqa
        xorijiy videolarni oʻzbek tiliga dublyaj (dublaj) qiluvchi onlayn dastur. Nutqni aniqlash, neyron tarjima va oʻzbekcha nutq
        sintezi (TTS) uchun sunʼiy intellekt modellaridan foydalanadi, videodagi spikerning jinsini aniqlab, unga mos ovoz tanlaydi.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 40, gap: 32 },
  statValue: { fontSize: 36, lineHeight: 42, fontWeight: '600', letterSpacing: -1.08, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 16, marginTop: 4 },
  section: { paddingHorizontal: 16, paddingVertical: 96, gap: 40 },
  bandTop: { borderTopWidth: 1 },
  sectionTitle: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9 },
  stack16: { gap: 16 },
  serviceCard: { padding: 24 },
  serviceTag: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  serviceTagText: { fontSize: 14, fontWeight: '500' },
  serviceTitle: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4, marginTop: 12 },
  body: { fontSize: 16, lineHeight: 26, marginTop: 8 },
  gets: { marginTop: 20, gap: 8 },
  getRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  getText: { fontSize: 14 },
  cost: { marginTop: 20, borderTopWidth: 1, paddingTop: 16 },
  mt20: { marginTop: 20 },
  mt8: { marginTop: 8 },
  steps: { gap: 32 },
  stepNum: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  stepTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  tgBlock: { borderRadius: radius.card, padding: 32, gap: 12 },
  tgText: { fontSize: 18, lineHeight: 29, opacity: 0.75 },
  tgButton: {
    marginTop: 20,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.control,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  tgButtonText: { fontSize: 16, fontWeight: '500', color: '#0B0D12' },
  aboutText: { fontSize: 18, lineHeight: 29 },
});
