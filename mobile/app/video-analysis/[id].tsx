import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as analysisApi from '../../src/features/analysis/api';
import {
  AnalysisVideoPlayer,
  type AnalysisVideoPlayerHandle,
} from '../../src/features/analysis/components/AnalysisVideoPlayer';
import { useAnalysisJob } from '../../src/features/analysis/hooks/useAnalysisJob';
import { ANALYSIS_STATUS_LABELS, displayLanguage, type TranscriptSegment } from '../../src/features/analysis/types';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatTimestamp } from '../../src/utils/format';
import { extractYouTubeId } from '../../src/utils/youtube';

// Notes / Quiz / Q&A are Phase 7 scope — not implemented here yet, per
// MOBILE_INTEGRATION_AUDIT.md §8 (they're lazily generated backend endpoints
// distinct from the eager summary/key_points/chapters this screen shows).
type Tab = 'summary' | 'chapters' | 'transcript';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Xulosa' },
  { key: 'chapters', label: 'Chapterlar' },
  { key: 'transcript', label: 'Transkript' },
];

export default function VideoAnalysisScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: analysis, isLoading, error } = useAnalysisJob(id);
  const playerRef = useRef<AnalysisVideoPlayerHandle>(null);
  const [tab, setTab] = useState<Tab>('summary');

  const isDone = analysis?.status === 'completed';

  const transcriptQuery = useQuery({
    queryKey: ['analysis-transcript', id],
    queryFn: () => analysisApi.getTranscript(id),
    enabled: isDone && tab === 'transcript',
  });

  const seek = (seconds: number) => playerRef.current?.seekTo(seconds);
  const videoId = analysis ? extractYouTubeId(analysis.youtube_url) : null;

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
          {isLoading && (
            <ThemedView style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </ThemedView>
          )}
          {error && (
            <ThemedView style={styles.center}>
              <ThemedText style={{ color: colors.danger, textAlign: 'center', paddingHorizontal: 24 }}>
                {getErrorMessage(error, 'Tahlil topilmadi.')}
              </ThemedText>
            </ThemedView>
          )}

          {analysis && !isDone && analysis.status !== 'failed' && (
            <ThemedView style={styles.center}>
              <ActivityIndicator color={colors.accent} style={{ marginBottom: 12 }} />
              <ThemedText style={styles.statusTitle}>{ANALYSIS_STATUS_LABELS[analysis.status]}</ThemedText>
              {analysis.status_message && (
                <ThemedText variant="secondary" style={styles.statusMessage}>
                  {analysis.status_message}
                </ThemedText>
              )}
              <ThemedView style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <ThemedView
                  style={[styles.progressFill, { backgroundColor: colors.accent, width: `${analysis.progress || 0}%` }]}
                />
              </ThemedView>
            </ThemedView>
          )}

          {analysis && analysis.status === 'failed' && (
            <ThemedView style={styles.center}>
              <ThemedText style={[styles.statusTitle, { color: colors.danger }]}>Xatolik yuz berdi</ThemedText>
              <ThemedText variant="secondary" style={styles.statusMessage}>
                {analysis.error_message || "Videoni tahlil qilishda xatolik yuz berdi."}
              </ThemedText>
            </ThemedView>
          )}

          {analysis && isDone && (
            <ThemedView style={styles.flex}>
              {videoId ? (
                <ThemedView style={styles.playerWrap}>
                  <AnalysisVideoPlayer ref={playerRef} videoId={videoId} />
                </ThemedView>
              ) : (
                <ThemedView style={[styles.playerWrap, styles.playerFallback, { backgroundColor: colors.surface }]}>
                  <ThemedText variant="secondary">Video ko&apos;rsatib bo&apos;lmadi</ThemedText>
                </ThemedView>
              )}

              <ThemedText style={styles.title}>{analysis.video_title}</ThemedText>

              <ThemedView style={styles.badgeRow}>
                {analysis.video_language && (
                  <ThemedView style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ThemedText variant="secondary" style={styles.badgeText}>
                      Original: {displayLanguage(analysis.video_language)}
                    </ThemedText>
                  </ThemedView>
                )}
                <ThemedView style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <ThemedText variant="secondary" style={styles.badgeText}>
                    Tahlil: {displayLanguage(analysis.language)}
                  </ThemedText>
                </ThemedView>
              </ThemedView>

              <ThemedView style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {TABS.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={[styles.tab, tab === t.key && { backgroundColor: colors.background }]}
                  >
                    <ThemedText style={[styles.tabLabel, tab === t.key && { color: colors.accent }]}>{t.label}</ThemedText>
                  </Pressable>
                ))}
              </ThemedView>

              {tab === 'summary' && (
                <ScrollView contentContainerStyle={styles.tabContent}>
                  <ThemedView style={{ gap: 20 }}>
                    {analysis.summary && (
                      <>
                        <SummaryBlock label="Qisqa" text={analysis.summary.short} />
                        <SummaryBlock label="O'rtacha" text={analysis.summary.medium} />
                        <SummaryBlock label="Batafsil" text={analysis.summary.detailed} />
                      </>
                    )}
                    {analysis.key_points && analysis.key_points.length > 0 && (
                      <ThemedView style={{ gap: 8 }}>
                        <ThemedText style={styles.sectionLabel}>Asosiy fikrlar</ThemedText>
                        {analysis.key_points.map((kp, i) => (
                          <Pressable
                            key={i}
                            onPress={() => seek(kp.timestamp)}
                            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
                          >
                            <ThemedText style={[styles.timestamp, { color: colors.accent, backgroundColor: colors.accentGlow }]}>
                              {formatTimestamp(kp.timestamp)}
                            </ThemedText>
                            <ThemedView style={{ flex: 1, gap: 2 }}>
                              <ThemedText style={styles.rowTitle}>{kp.title}</ThemedText>
                              <ThemedText variant="secondary" style={styles.rowDescription}>
                                {kp.description}
                              </ThemedText>
                            </ThemedView>
                          </Pressable>
                        ))}
                      </ThemedView>
                    )}
                  </ThemedView>
                </ScrollView>
              )}

              {tab === 'chapters' && (
                <FlatList
                  data={analysis.chapters || []}
                  keyExtractor={(_, i) => `chapter-${i}`}
                  contentContainerStyle={styles.tabContent}
                  ListEmptyComponent={<ThemedText variant="secondary">Chapterlar topilmadi.</ThemedText>}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => seek(item.start)}
                      style={[styles.chapterRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    >
                      <ThemedText style={styles.rowTitle}>{item.title}</ThemedText>
                      <ThemedText style={[styles.timestamp, { color: colors.accent }]}>{formatTimestamp(item.start)}</ThemedText>
                    </Pressable>
                  )}
                />
              )}

              {tab === 'transcript' && (
                <FlatList<TranscriptSegment>
                  data={transcriptQuery.data?.segments || []}
                  keyExtractor={(_, i) => `segment-${i}`}
                  contentContainerStyle={styles.tabContent}
                  ListEmptyComponent={
                    transcriptQuery.isLoading ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <ThemedText variant="secondary">Transkript topilmadi.</ThemedText>
                    )
                  }
                  renderItem={({ item }) => (
                    <Pressable onPress={() => seek(item.start)} style={styles.transcriptRow}>
                      <ThemedText style={[styles.timestamp, { color: colors.accent }]}>{formatTimestamp(item.start)}</ThemedText>
                      <ThemedText style={styles.transcriptText}>{item.text}</ThemedText>
                    </Pressable>
                  )}
                />
              )}
            </ThemedView>
          )}
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

function SummaryBlock({ label, text }: { label: string; text: string }) {
  return (
    <ThemedView style={{ gap: 6 }}>
      <ThemedText style={styles.sectionLabel}>{label}</ThemedText>
      <ThemedText style={styles.summaryText}>{text}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  statusMessage: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginBottom: 16 },
  progressTrack: { width: '100%', maxWidth: 280, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  playerWrap: { paddingHorizontal: 20, paddingTop: 16 },
  playerFallback: { aspectRatio: 16 / 9, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', paddingHorizontal: 20, paddingTop: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 14, borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  tabContent: { padding: 20, gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryText: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'flex-start' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowDescription: { fontSize: 12, fontWeight: '500' },
  chapterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  transcriptRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  timestamp: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  transcriptText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
