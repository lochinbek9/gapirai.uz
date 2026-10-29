import { Image } from 'expo-image';
import { Brain, Check, Globe, Mic, Rocket, Zap } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { radius } from '../../../theme/colors';
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

export function SampleVideos({ onSelect, activeUrl }: { onSelect: (s: SampleVideo) => void; activeUrl?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText style={styles.label}>Namunalar</ThemedText>
        <ThemedText variant="secondary" style={styles.sub}>
          Havola izlamasdan bittasini tanlang
        </ThemedText>
      </View>
      <View style={styles.grid}>
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
              style={({ pressed }) => [
                styles.card,
                { borderColor: selected ? colors.accent : pressed ? colors.muted : colors.rule },
                selected && styles.cardSelected,
              ]}
            >
              <View style={[styles.thumbWrap, { backgroundColor: colors.ground }]}>
                <Image source={{ uri: s.thumbnail }} style={styles.thumb} contentFit="cover" transition={150} />
                <View style={styles.duration}>
                  <ThemedText style={styles.durationText}>{s.durationText}</ThemedText>
                </View>
                {selected && (
                  <View style={[styles.picked, { backgroundColor: colors.accent }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={2.5} />
                    <ThemedText style={styles.pickedText}>Tanlangan</ThemedText>
                  </View>
                )}
              </View>
              <View style={styles.body}>
                <ThemedText numberOfLines={2} style={styles.title}>
                  {s.title}
                </ThemedText>
                <View style={styles.meta}>
                  <View style={styles.metaItem}>
                    <Icon size={14} color={colors.muted} strokeWidth={2} />
                    <ThemedText variant="secondary" numberOfLines={1} style={styles.metaText}>
                      {s.category}
                    </ThemedText>
                  </View>
                  <View style={styles.metaItem}>
                    <Mic size={12} color={colors.muted} strokeWidth={2} />
                    <ThemedText variant="secondary" style={styles.metaText}>
                      {s.gender === 'male' ? 'Erkak' : 'Ayol'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 16, rowGap: 4 },
  label: { fontSize: 14, fontWeight: '500' },
  sub: { fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 2 ustun: (100% - 8 gap) / 2
  card: { width: '48.6%', flexGrow: 1, borderWidth: 1, borderRadius: radius.control, overflow: 'hidden' },
  cardSelected: { borderWidth: 2 },
  thumbWrap: { aspectRatio: 16 / 9, width: '100%' },
  thumb: { width: '100%', height: '100%' },
  duration: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  picked: { position: 'absolute', left: 4, top: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pickedText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  body: { flex: 1, padding: 10, gap: 6 },
  title: { fontSize: 13, fontWeight: '500', lineHeight: 17 },
  meta: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12 },
});
