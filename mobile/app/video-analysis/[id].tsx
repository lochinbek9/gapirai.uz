import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { AppHeader } from '../../src/components/AppHeader';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as analysisApi from '../../src/features/analysis/api';
import {
  AnalysisVideoPlayer,
  type AnalysisVideoPlayerHandle,
} from '../../src/features/analysis/components/AnalysisVideoPlayer';
import { useAnalysisJob } from '../../src/features/analysis/hooks/useAnalysisJob';
import {
  ANALYSIS_STATUS_LABELS,
  displayLanguage,
  type BilingualSegment,
  type QAEntry,
  type QuizQuestion,
  type TranscriptSegment,
} from '../../src/features/analysis/types';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatTimestamp } from '../../src/utils/format';
import { extractYouTubeId } from '../../src/utils/youtube';

type Tab = 'summary' | 'chapters' | 'transcript' | 'notes' | 'quiz' | 'qa';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Xulosa' },
  { key: 'chapters', label: 'Chapterlar' },
  { key: 'transcript', label: 'Transkript' },
  { key: 'notes', label: 'Konspekt' },
  { key: 'quiz', label: 'Test' },
  { key: 'qa', label: 'Savol-javob' },
];

export default function VideoAnalysisScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: analysis, isLoading, error } = useAnalysisJob(id);
  const playerRef = useRef<AnalysisVideoPlayerHandle>(null);
  const [tab, setTab] = useState<Tab>('summary');

  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TranscriptSegment[] | null>(null);
  const [transcriptView, setTranscriptView] = useState<'normal' | 'bilingual'>('normal');
  const [bilingual, setBilingual] = useState<BilingualSegment[] | null>(null);
  const [bilingualLoading, setBilingualLoading] = useState(false);

  const isDone = analysis?.status === 'completed';

  const transcriptQuery = useQuery({
    queryKey: ['analysis-transcript', id],
    queryFn: () => analysisApi.getTranscript(id),
    enabled: isDone && tab === 'transcript',
  });

  useEffect(() => {
    if (analysis?.notes) setNotes(analysis.notes);
    if (analysis?.quiz) setQuiz(analysis.quiz);
    if (analysis?.qa_history) setQaHistory(analysis.qa_history);
  }, [analysis]);

  const seek = (seconds: number) => playerRef.current?.seekTo(seconds);
  const videoId = analysis ? extractYouTubeId(analysis.youtube_url) : null;
  const showBilingualToggle = !!(analysis?.video_language && analysis.video_language !== analysis.language);

  const handleGenerateNotes = async () => {
    if (!id) return;
    setNotesLoading(true);
    try {
      const res = await analysisApi.generateNotes(id);
      setNotes(res.notes);
    } catch {
      Alert.alert('Xatolik', 'Konspekt yaratishda xatolik yuz berdi.');
    } finally {
      setNotesLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!id) return;
    setQuizLoading(true);
    try {
      const res = await analysisApi.generateQuiz(id);
      setQuiz(res.quiz);
    } catch {
      Alert.alert('Xatolik', 'Test yaratishda xatolik yuz berdi.');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!id || !question.trim()) return;
    setAsking(true);
    try {
      const entry = await analysisApi.askQuestion(id, question.trim());
      setQaHistory((prev) => [...prev, entry]);
      setQuestion('');
    } catch {
      Alert.alert('Xatolik', 'Savolga javob berishda xatolik yuz berdi.');
    } finally {
      setAsking(false);
    }
  };

  const handleToggleBilingual = async () => {
    if (transcriptView === 'bilingual') {
      setTranscriptView('normal');
      return;
    }
    setTranscriptView('bilingual');
    if (!id || bilingual) return;
    setBilingualLoading(true);
    try {
      const res = await analysisApi.generateBilingual(id);
      setBilingual(res.segments);
    } catch {
      Alert.alert('Xatolik', "Bilingual ko'rinishni yaratishda xatolik yuz berdi.");
      setTranscriptView('normal');
    } finally {
      setBilingualLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!id || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await analysisApi.searchTranscript(id, searchQuery.trim());
    setSearchResults(res.results);
  };

  return (
    <>
      <ThemedView style={styles.flex}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.flex}>
          <AppHeader />
          {isLoading && (
            <ThemedView style={styles.center}>
              <ActivityIndicator color={colors.muted} />
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

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={[styles.tabs, { backgroundColor: colors.ground, borderColor: colors.rule }]}
              >
                {TABS.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={[styles.tab, tab === t.key && { backgroundColor: colors.surface, borderColor: colors.rule }]}
                  >
                    <ThemedText style={[styles.tabLabel, { color: tab === t.key ? colors.ink : colors.muted }]}>{t.label}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>

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
                transcriptView === 'bilingual' ? (
                  bilingualLoading ? (
                    <ThemedView style={styles.center}>
                      <ActivityIndicator color={colors.muted} />
                      <ThemedText variant="secondary" style={{ marginTop: 10 }}>
                        Bilingual ko&apos;rinish tayyorlanmoqda...
                      </ThemedText>
                    </ThemedView>
                  ) : (
                    <FlatList<BilingualSegment>
                      data={bilingual || []}
                      keyExtractor={(_, i) => `bilingual-${i}`}
                      contentContainerStyle={styles.tabContent}
                      ListHeaderComponent={
                        <ThemedView style={{ marginBottom: 10 }}>
                          <TranscriptViewToggle
                            transcriptView={transcriptView}
                            onNormal={() => setTranscriptView('normal')}
                            onBilingual={handleToggleBilingual}
                            colors={colors}
                          />
                        </ThemedView>
                      }
                      renderItem={({ item }) => (
                        <Pressable
                          onPress={() => seek(item.start)}
                          style={[styles.bilingualRow, { borderColor: colors.border }]}
                        >
                          <ThemedText style={[styles.timestamp, { color: colors.accent }]}>
                            {formatTimestamp(item.start)}
                          </ThemedText>
                          <ThemedView style={{ flex: 1, gap: 4 }}>
                            <ThemedText style={styles.transcriptText}>{item.original}</ThemedText>
                            <ThemedText variant="secondary" style={styles.transcriptText}>
                              {item.translated}
                            </ThemedText>
                          </ThemedView>
                        </Pressable>
                      )}
                    />
                  )
                ) : (
                  <FlatList<TranscriptSegment>
                    data={searchResults ?? transcriptQuery.data?.segments ?? []}
                    keyExtractor={(_, i) => `segment-${i}`}
                    contentContainerStyle={styles.tabContent}
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={
                      <ThemedView style={{ gap: 10, marginBottom: 10 }}>
                        {showBilingualToggle && (
                          <TranscriptViewToggle
                            transcriptView={transcriptView}
                            onNormal={() => setTranscriptView('normal')}
                            onBilingual={handleToggleBilingual}
                            colors={colors}
                          />
                        )}
                        <ThemedView style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                            placeholder="Transkript ichidan qidirish..."
                            placeholderTextColor={colors.textSecondary}
                            style={[
                              styles.textInput,
                              { flex: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary },
                            ]}
                          />
                          <Pressable
                            onPress={handleSearch}
                            style={[styles.searchButton, { backgroundColor: colors.dark }]}
                          >
                            <ThemedText style={{ color: colors.darkInk, fontWeight: '500', fontSize: 15 }}>Qidirish</ThemedText>
                          </Pressable>
                        </ThemedView>
                      </ThemedView>
                    }
                    ListEmptyComponent={
                      transcriptQuery.isLoading ? (
                        <ActivityIndicator color={colors.muted} />
                      ) : (
                        <ThemedText variant="secondary">
                          {searchResults ? 'Hech narsa topilmadi.' : 'Transkript topilmadi.'}
                        </ThemedText>
                      )
                    }
                    renderItem={({ item }) => (
                      <Pressable onPress={() => seek(item.start)} style={styles.transcriptRow}>
                        <ThemedText style={[styles.timestamp, { color: colors.accent }]}>{formatTimestamp(item.start)}</ThemedText>
                        <ThemedText style={styles.transcriptText}>{item.text}</ThemedText>
                      </Pressable>
                    )}
                  />
                )
              )}

              {tab === 'notes' && (
                <ScrollView contentContainerStyle={styles.tabContent}>
                  {notes ? (
                    <ThemedText style={styles.summaryText}>{notes}</ThemedText>
                  ) : (
                    <Pressable
                      onPress={handleGenerateNotes}
                      disabled={notesLoading}
                      style={[styles.generateButton, { backgroundColor: colors.dark, opacity: notesLoading ? 0.6 : 1 }]}
                    >
                      {notesLoading && <ActivityIndicator color={colors.darkInk} style={{ marginRight: 8 }} />}
                      <ThemedText style={{ color: colors.darkInk, fontWeight: '500', fontSize: 15 }}>
                        {notesLoading ? 'Yaratilmoqda...' : 'Konspekt tuzish'}
                      </ThemedText>
                    </Pressable>
                  )}
                </ScrollView>
              )}

              {tab === 'quiz' && (
                <ScrollView contentContainerStyle={[styles.tabContent, { gap: 14 }]}>
                  {!quiz ? (
                    <Pressable
                      onPress={handleGenerateQuiz}
                      disabled={quizLoading}
                      style={[styles.generateButton, { backgroundColor: colors.dark, opacity: quizLoading ? 0.6 : 1 }]}
                    >
                      {quizLoading && <ActivityIndicator color={colors.darkInk} style={{ marginRight: 8 }} />}
                      <ThemedText style={{ color: colors.darkInk, fontWeight: '500', fontSize: 15 }}>
                        {quizLoading ? 'Yaratilmoqda...' : 'Test tuzish'}
                      </ThemedText>
                    </Pressable>
                  ) : (
                    quiz.map((q, qi) => {
                      const chosen = quizAnswers[qi];
                      const showResult = chosen !== undefined;
                      return (
                        <ThemedView
                          key={qi}
                          style={[styles.quizCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <ThemedText style={styles.rowTitle}>
                            {qi + 1}. {q.question}
                          </ThemedText>
                          <ThemedView style={{ gap: 6 }}>
                            {q.options.map((opt, oi) => {
                              const isChosen = chosen === oi;
                              const isCorrect = oi === q.correct_answer;
                              const optionColor =
                                showResult && isCorrect
                                  ? colors.success
                                  : showResult && isChosen
                                    ? colors.danger
                                    : colors.textPrimary;
                              const optionBg =
                                showResult && isCorrect
                                  ? `${colors.success}26`
                                  : showResult && isChosen
                                    ? `${colors.danger}26`
                                    : colors.background;
                              const optionBorder =
                                showResult && isCorrect
                                  ? colors.success
                                  : showResult && isChosen
                                    ? colors.danger
                                    : colors.border;
                              return (
                                <Pressable
                                  key={oi}
                                  disabled={showResult}
                                  onPress={() => setQuizAnswers((prev) => ({ ...prev, [qi]: oi }))}
                                  style={[styles.quizOption, { backgroundColor: optionBg, borderColor: optionBorder }]}
                                >
                                  <ThemedText style={{ color: optionColor, fontSize: 13, fontWeight: '500' }}>{opt}</ThemedText>
                                </Pressable>
                              );
                            })}
                          </ThemedView>
                          {showResult && (
                            <ThemedView style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                              <Pressable onPress={() => seek(q.timestamp)}>
                                <ThemedText style={[styles.timestamp, { color: colors.accent }]}>
                                  {formatTimestamp(q.timestamp)}
                                </ThemedText>
                              </Pressable>
                              <ThemedText variant="secondary" style={[styles.rowDescription, { flex: 1 }]}>
                                {q.explanation}
                              </ThemedText>
                            </ThemedView>
                          )}
                        </ThemedView>
                      );
                    })
                  )}
                </ScrollView>
              )}

              {tab === 'qa' && (
                <ThemedView style={[styles.tabContent, { flex: 1, gap: 14 }]}>
                  <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
                    {qaHistory.length === 0 && (
                      <ThemedText variant="secondary">Video haqida savol bering.</ThemedText>
                    )}
                    {qaHistory.map((qa, i) => (
                      <ThemedView key={i} style={{ gap: 6 }}>
                        <ThemedText style={styles.rowTitle}>{qa.question}</ThemedText>
                        <ThemedText variant="secondary" style={styles.summaryText}>
                          {qa.answer}
                        </ThemedText>
                        {qa.timestamps?.length > 0 && (
                          <ThemedView style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {qa.timestamps.map((ts, ti) => (
                              <Pressable key={ti} onPress={() => seek(ts)}>
                                <ThemedText style={[styles.timestamp, { color: colors.accent, backgroundColor: colors.accentGlow }]}>
                                  {formatTimestamp(ts)}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </ThemedView>
                        )}
                      </ThemedView>
                    ))}
                  </ScrollView>
                  <ThemedView style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={question}
                      onChangeText={setQuestion}
                      onSubmitEditing={handleAsk}
                      returnKeyType="send"
                      placeholder="Video haqida savol bering..."
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        styles.textInput,
                        { flex: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary },
                      ]}
                    />
                    <Pressable
                      onPress={handleAsk}
                      disabled={asking || !question.trim()}
                      style={[
                        styles.sendButton,
                        { backgroundColor: colors.dark, opacity: asking || !question.trim() ? 0.5 : 1 },
                      ]}
                    >
                      {asking ? (
                        <ActivityIndicator color={colors.muted} />
                      ) : (
                        <ThemedText style={{ color: colors.accent, fontWeight: '600', fontSize: 16 }}>➤</ThemedText>
                      )}
                    </Pressable>
                  </ThemedView>
                </ThemedView>
              )}
            </ThemedView>
          )}
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

function TranscriptViewToggle({
  transcriptView,
  onNormal,
  onBilingual,
  colors,
}: {
  transcriptView: 'normal' | 'bilingual';
  onNormal: () => void;
  onBilingual: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <ThemedView style={[styles.viewToggle, { backgroundColor: colors.ground, borderColor: colors.rule }]}>
      <Pressable
        onPress={onNormal}
        style={[styles.viewToggleOption, transcriptView === 'normal' && { backgroundColor: colors.surface }]}
      >
        <ThemedText style={[styles.tabLabel, { color: transcriptView === 'normal' ? colors.ink : colors.muted }]}>Oddiy</ThemedText>
      </Pressable>
      <Pressable
        onPress={onBilingual}
        style={[styles.viewToggleOption, transcriptView === 'bilingual' && { backgroundColor: colors.surface }]}
      >
        <ThemedText style={[styles.tabLabel, { color: transcriptView === 'bilingual' ? colors.ink : colors.muted }]}>
          Bilingual
        </ThemedText>
      </Pressable>
    </ThemedView>
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
  statusTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  statusMessage: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  progressTrack: { width: '100%', maxWidth: 320, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  playerWrap: { paddingHorizontal: 16, paddingTop: 16 },
  playerFallback: { aspectRatio: 16 / 9, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '500' },
  tabsScroll: { marginHorizontal: 16, marginTop: 16, flexGrow: 0 },
  tabs: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 4, gap: 4 },
  tab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  tabLabel: { fontSize: 14, fontWeight: '500' },
  tabContent: { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 16, fontWeight: '600' },
  summaryText: { fontSize: 16, lineHeight: 26 },
  row: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowDescription: { fontSize: 14, lineHeight: 20 },
  chapterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  transcriptRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  timestamp: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  transcriptText: { flex: 1, fontSize: 15, lineHeight: 22 },
  bilingualRow: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  viewToggle: { flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 4, gap: 4 },
  viewToggleOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 48, fontSize: 16, fontFamily: 'Geist_400Regular' },
  searchButton: { paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  generateButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
  },
  quizCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  quizOption: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
