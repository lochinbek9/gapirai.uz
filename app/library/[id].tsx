import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as dubbingApi from '../../src/features/dubbing/api';
import { DubbedVideoPlayer } from '../../src/features/dubbing/components/VideoPlayer';
import type { Job, ResolutionOption } from '../../src/features/dubbing/types';
import * as libraryApi from '../../src/features/library/api';
import type { LibraryItem } from '../../src/features/library/types';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDuration } from '../../src/utils/format';

const POLL_INTERVAL_MS = 4000;

// Mirrors frontend/app/library/[id]/page.tsx: player + resolution switcher
// (library-scoped resolution endpoints — availability is gated by the
// VIEWER's plan, not the video owner's) + a list of other library videos.
export default function LibraryWatchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionOption[] | null>(null);
  const [activeResolution, setActiveResolution] = useState('720p');
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      libraryApi.getLibraryAccess(),
      libraryApi.getLibraryEligible(id),
      dubbingApi.getJob(id),
      libraryApi.getLibrary(24, 0),
    ])
      .then(([access, eligible, jobData, list]) => {
        if (cancelled) return;
        if (!access.has_access || !eligible.eligible) {
          router.replace('/library');
          return;
        }
        setJob(jobData);
        setItems(list);
        setVideoSrc(dubbingApi.getVideoUrl(jobData.job_id));
        setActiveResolution('720p');
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Videoni yuklashda xatolik yuz berdi.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    if (!job) return;
    libraryApi
      .getLibraryJobResolutions(job.job_id)
      .then((res) => setResolutions(res.resolutions))
      .catch(() => {});
  }, [job]);

  const handleSelectResolution = async (opt: ResolutionOption) => {
    if (!job || !opt.available || switching) return;
    setSwitching(opt.resolution);
    try {
      const res = await libraryApi.requestLibraryResolution(job.job_id, opt.resolution);
      if (res.status === 'ready' && res.download_url) {
        setVideoSrc(res.download_url);
        setActiveResolution(opt.resolution);
        setSwitching(null);
        return;
      }
      const poll = setInterval(async () => {
        try {
          const updated = await libraryApi.getLibraryJobResolutions(job.job_id);
          setResolutions(updated.resolutions);
          const found = updated.resolutions.find((r) => r.resolution === opt.resolution);
          if (found?.status === 'ready') {
            const again = await libraryApi.requestLibraryResolution(job.job_id, opt.resolution);
            if (again.download_url) {
              setVideoSrc(again.download_url);
              setActiveResolution(opt.resolution);
            }
            clearInterval(poll);
            setSwitching(null);
          } else if (found?.status === 'failed') {
            clearInterval(poll);
            setSwitching(null);
          }
        } catch {
          clearInterval(poll);
          setSwitching(null);
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setSwitching(null);
    }
  };

  const otherItems = items.filter((item) => item.job_id !== id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            {loading && (
              <ThemedView style={styles.loadingRow}>
                <ActivityIndicator color={colors.textSecondary} />
              </ThemedView>
            )}

            {!loading && error && (
              <ThemedText style={{ color: colors.danger, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>
                {error}
              </ThemedText>
            )}

            {!loading && !error && job && videoSrc && (
              <>
                <DubbedVideoPlayer key={videoSrc} uri={videoSrc} title={job.video_title} />

                <ThemedText style={styles.title}>{job.video_title || 'Nomsiz video'}</ThemedText>
                <ThemedView style={styles.metaRow}>
                  <ThemedText style={[styles.metaBadge, { color: colors.success }]}>✓ Dublyaj qilingan</ThemedText>
                  {job.video_duration != null && (
                    <ThemedText variant="secondary" style={styles.metaText}>
                      {formatDuration(job.video_duration)}
                    </ThemedText>
                  )}
                </ThemedView>

                {resolutions && (
                  <ThemedView style={styles.resolutionsRow}>
                    {resolutions.map((opt) => {
                      const isActive = activeResolution === opt.resolution;
                      const isBusy = switching === opt.resolution;
                      if (!opt.available) {
                        return (
                          <Pressable
                            key={opt.resolution}
                            onPress={() => router.push('/pricing')}
                            style={[styles.resChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                          >
                            <ThemedText variant="secondary" style={styles.resChipLabel}>
                              🔒 {opt.resolution}
                            </ThemedText>
                          </Pressable>
                        );
                      }
                      return (
                        <Pressable
                          key={opt.resolution}
                          disabled={isBusy}
                          onPress={() => handleSelectResolution(opt)}
                          style={[
                            styles.resChip,
                            isActive
                              ? { backgroundColor: colors.accent, borderWidth: 0 }
                              : { borderColor: colors.border, backgroundColor: colors.surface },
                            { opacity: isBusy ? 0.7 : 1 },
                          ]}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={isActive ? '#fff' : colors.textSecondary} />
                          ) : (
                            <ThemedText
                              style={isActive ? styles.resChipActiveLabel : [styles.resChipLabel, { color: colors.textPrimary }]}
                            >
                              {opt.resolution}
                            </ThemedText>
                          )}
                        </Pressable>
                      );
                    })}
                  </ThemedView>
                )}

                <ThemedText style={styles.sectionTitle}>Boshqa ommaviy videolar</ThemedText>
                {otherItems.length === 0 && (
                  <ThemedText variant="secondary" style={{ fontSize: 12 }}>
                    Boshqa video hozircha yo&apos;q.
                  </ThemedText>
                )}
                {otherItems.map((item) => (
                  <Pressable
                    key={item.job_id}
                    onPress={() => router.push(`/library/${item.job_id}`)}
                    style={styles.relatedRow}
                  >
                    <ThemedView style={styles.relatedThumbWrap}>
                      {item.video_thumbnail && (
                        <Image source={{ uri: item.video_thumbnail }} style={styles.relatedThumb} contentFit="cover" />
                      )}
                    </ThemedView>
                    <ThemedText numberOfLines={2} style={styles.relatedTitle}>
                      {item.video_title || 'Nomsiz video'}
                    </ThemedText>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  loadingRow: { alignItems: 'center', paddingVertical: 60 },
  title: { fontSize: 18, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaBadge: { fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 12, fontWeight: '600' },
  resolutionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resChipLabel: { fontSize: 12, fontWeight: '700' },
  resChipActiveLabel: { fontSize: 12, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  relatedRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  relatedThumbWrap: {
    width: 120,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#00000010',
  },
  relatedThumb: { width: '100%', height: '100%' },
  relatedTitle: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 16 },
});
