import { Image } from 'expo-image';
import { Brain, Check, Globe, Rocket, Zap } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';
import type { VoiceGender } from '../types';

// frontend/components/SampleVideosSection.tsx bilan bir xil ro'yxat
const CATEGORY_ICONS = { brain: Brain, rocket: Rocket, globe: Globe, zap: Zap };

export interface SampleVideo {
  id: string;
  url: string;
  title: string;
  category: string;
  categoryIcon: keyof typeof CATEGORY_ICONS;
  durationText: string;
  thumbnail: string;
  gender: Exclude<VoiceGender, 'auto'>;
}

export const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: 'fear',
    url: 'https://youtu.be/UwMS0J2eTXE',
    title: "Qo'rquvni qanday yengish mumkin?",
    category: 'Psixologiya',
    categoryIcon: 'brain',
    durationText: '0:58',
    thumbnail: 'https://i.ytimg.com/vi/UwMS0J2eTXE/hqdefault.jpg',
    gender: 'male',
  },
  {
    id: 'ai',
    url: 'https://youtu.be/2ePf9rue1Ao',
    title: "Sun'iy intellekt kelajagi va insoniyat",
    category: 'Texnologiya',
    categoryIcon: 'rocket',
    durationText: '0:45',
    thumbnail: 'https://i.ytimg.com/vi/2ePf9rue1Ao/hqdefault.jpg',
    gender: 'female',
  },
  {
    id: 'cosmos',
    url: 'https://youtu.be/pDmg2DyOp7o',
    title: "Koinot mo'jizalari va qora tuynuklar",
    category: 'Fan & Olam',
    categoryIcon: 'globe',
    durationText: '0:22',
    thumbnail: 'https://i.ytimg.com/vi/pDmg2DyOp7o/hqdefault.jpg',
    gender: 'male',
  },
  {
    id: 'habit',
    url: 'https://youtu.be/kqQLQZ7vTcI',
    title: '2 daqiqalik qoida: Dangasalikni yengish',
    category: 'Samaradorlik',
    categoryIcon: 'zap',
    durationText: '0:22',
    thumbnail: 'https://i.ytimg.com/vi/kqQLQZ7vTcI/hqdefault.jpg',
    gender: 'male',
  },
];

/** Namunalar: gorizontal aylantiriladigan qator (ilovada 2 ustunli katak sahifani
 *  cho'zib yuborardi). Kartada ramka yo'q -- rasm, nom va bitta kulrang qator;
 *  tanlangani rasm atrofidagi aksent halqa va belgi bilan ajraladi. */
/** Namunalar: gorizontal aylantiriladigan qator (2 ustunli katak sahifani cho'zib
 *  yuborardi). Kartada ramka yo'q -- rasm, nom va bitta kulrang qator; tanlangani
 *  rasm atrofidagi aksent halqa va belgi bilan ajraladi. */
export function SampleVideos({ onSelect, activeUrl }: { onSelect: (s: SampleVideo) => void; activeUrl?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View>
        <ThemedText style={styles.label}>Namunalar</ThemedText>
        <ThemedText variant="secondary" style={styles.sub}>
          Havola izlamasdan bittasini tanlab sinab koʻring
        </ThemedText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + GAP}
      >
        {SAMPLE_VIDEOS.map((s) => {
          const selected = activeUrl === s.url;
          const Icon = CATEGORY_ICONS[s.categoryIcon];
          return (
            <Pressable
              key={s.id}
              onPress={() => onSelect(s)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${s.title}, ${s.durationText}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.thumbWrap, { backgroundColor: colors.ground, borderColor: selected ? colors.accent : 'transparent' }]}>
                <Image source={{ uri: s.thumbnail }} style={styles.thumb} contentFit="cover" transition={150} />
                <View style={styles.duration}>
                  <ThemedText style={styles.durationText}>{s.durationText}</ThemedText>
                </View>
                {selected && (
                  <View style={[styles.picked, { backgroundColor: colors.accent }]}>
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
              <ThemedText numberOfLines={2} style={styles.title}>
                {s.title}
              </ThemedText>
              <View style={styles.meta}>
                <Icon size={13} color={colors.muted} strokeWidth={2} />
                <ThemedText variant="secondary" numberOfLines={1} style={styles.metaText}>
                  {s.category} · {s.gender === 'male' ? 'Erkak' : 'Ayol'}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 216;
const GAP = 12;

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, fontWeight: '500' },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  // Forma ekran chetidan 16px ichkarida -- qator ekran chetigacha chiqadi, birinchi karta forma bilan bir chiziqda
  bleed: { marginHorizontal: -16 },
  row: { paddingHorizontal: 16, gap: GAP },
  card: { width: CARD_WIDTH },
  pressed: { opacity: 0.8 },
  thumbWrap: { aspectRatio: 16 / 9, width: '100%', borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  picked: { position: 'absolute', left: 6, top: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '500', lineHeight: 19, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: { fontSize: 12, flexShrink: 1 },
});
