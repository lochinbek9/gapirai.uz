import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Clapperboard, Play } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { PageTitle } from '../src/components/PageTitle';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { ThemedText } from '../src/components/ThemedText';
import { listPublicVideos, type PublicVideo } from '../src/features/videos/api';
import { radius } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';
import { formatRelativeTime, formatTimestamp } from '../src/utils/format';

// frontend/app/videos/VideosClient.tsx bilan bir xil: sarlavha, cheksiz ro'yxat, bo'sh holat.
// Video bosilsa ilovaning o'z sahifasi (video/[id]) ochiladi -- saytga chiqilmaydi.

export default function PublicVideosScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const query = useInfiniteQuery({
    queryKey: ['public-videos'],
    queryFn: ({ pageParam }) => listPublicVideos(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    staleTime: 60_000,
  });

  const seen = new Set<string>();
  const videos = (query.data?.pages ?? []).flatMap((p) => p.videos).filter((v) => !seen.has(v.id) && seen.add(v.id));

  const footer = query.isFetching && !query.isRefetching ? (
    <ActivityIndicator color={colors.muted} style={styles.status} />
  ) : query.isError ? (
    <Pressable onPress={() => (videos.length ? query.fetchNextPage() : query.refetch())} hitSlop={8} style={styles.status}>
      <ThemedText style={[styles.statusText, { color: colors.accentInk, fontWeight: '600' }]}>Yuklab boʻlmadi — qayta urinish</ThemedText>
    </Pressable>
  ) : !query.hasNextPage && videos.length > 0 ? (
    <ThemedText variant="secondary" style={[styles.status, styles.statusText]}>
      Hammasi koʻrsatildi
    </ThemedText>
  ) : null;

  return (
    <Screen scroll={false}>
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <PageTitle title="Ommaviy videolar" lead="Dunyo boʻylab foydali videolar — oʻzbek tilida. Tomosha qilish bepul." />
        }
        renderItem={({ item }) => <VideoItem video={item} onPress={() => router.push(`/video/${item.id}`)} />}
        ListEmptyComponent={
          query.isSuccess ? (
            <View style={styles.empty}>
              <Clapperboard size={24} color={colors.muted} strokeWidth={2} />
              <ThemedText style={styles.emptyTitle}>Hozircha bu yerda videolar yoʻq</ThemedText>
              <ThemedText variant="secondary" style={styles.emptyText}>
                Tez orada yangi videolar qoʻshiladi.
              </ThemedText>
              <PrimaryButton label="Oʻzingiz video dublaj qiling" fullWidth={false} onPress={() => router.navigate('/')} style={styles.emptyButton} />
            </View>
          ) : null
        }
        ListFooterComponent={footer}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) query.fetchNextPage();
        }}
        onEndReachedThreshold={1.5}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.muted} />}
      />
    </Screen>
  );
}

function VideoItem({ video, onPress }: { video: PublicVideo; onPress: () => void }) {
  const { colors } = useTheme();
  const when = formatRelativeTime(video.published_at);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${video.video_title || 'Video'} — koʻrish`}>
      {({ pressed }) => (
        <View style={pressed && styles.pressed}>
          <View style={[styles.thumb, { backgroundColor: colors.ground }]}>
            {video.video_thumbnail ? (
              <Image source={{ uri: video.video_thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.thumbEmpty}>
                <Play size={32} color={colors.muted} strokeWidth={2} />
              </View>
            )}
            {video.video_duration ? (
              <View style={styles.duration}>
                <ThemedText style={styles.durationText}>{formatTimestamp(video.video_duration)}</ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText numberOfLines={2} style={styles.title}>
            {video.video_title || 'Nomsiz video'}
          </ThemedText>
          <ThemedText variant="secondary" style={styles.meta}>
            {`Oʻzbekcha dublaj${when ? ` · ${when}` : ''}`}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 96, gap: 32 },
  pressed: { opacity: 0.75 },
  thumb: { aspectRatio: 16 / 9, width: '100%', borderRadius: radius.card, overflow: 'hidden' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '500', marginTop: 12 },
  meta: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  status: { alignSelf: 'center', paddingVertical: 8 },
  statusText: { fontSize: 14, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginTop: 16 },
  emptyText: { fontSize: 15, lineHeight: 22, marginTop: 4, textAlign: 'center' },
  emptyButton: { marginTop: 24 },
});
