import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { CircularProgress } from '../../src/components/CircularProgress';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as analysisApi from '../../src/features/analysis/api';
import {
  AnalysisVideoPlayer,
  type AnalysisVideoPlayerHandle,
} from '../../src/features/analysis/components/AnalysisVideoPlayer';
import { FiveMinuteSummary } from '../../src/features/analysis/components/FiveMinuteSummary';
import { QuizFlow } from '../../src/features/analysis/components/QuizFlow';
import { useAnalysisJob } from '../../src/features/analysis/hooks/useAnalysisJob';
import type { QAEntry, QuizQuestion } from '../../src/features/analysis/types';
import * as dubbingApi from '../../src/features/dubbing/api';
import { ProgressSteps } from '../../src/features/dubbing/components/ProgressSteps';
import { UploadRecoveryPrompt } from '../../src/features/dubbing/components/UploadRecoveryPrompt';
import { DubbedVideoPlayer, type DubbedVideoPlayerHandle } from '../../src/features/dubbing/components/VideoPlayer';
import { useDubbingJob } from '../../src/features/dubbing/hooks/useDubbingJob';
import { JOB_STATUS_LABELS, type JobStatus } from '../../src/features/dubbing/types';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDuration, formatRemainingTime } from '../../src/utils/format';
import { extractYouTubeId } from '../../src/utils/youtube';

const ACTIVE_STATUSES = ['pending', 'downloading', 'transcribing', 'translating', 'synthesizing', 'syncing', 'merging'];

// Frontend-only emoji/label layer for the Video tab's processing state --
// mirrors frontend/app/learn/[id]/page.tsx's PROCESSING_LABELS exactly. Does
// NOT touch job.status_message, which stays shared with /video/[id] (a real
// paying-customer page).
const PROCESSING_LABELS: Partial<Record<JobStatus, string>> = {
  pending: '🎬 Videoni tayyorlayapmiz',
  downloading: '🎬 Videoni tayyorlayapmiz',
  transcribing: '📝 Nutqni aniqlayapmiz',
  translating: "🇺🇿 O'zbekchaga tarjima qilinmoqda",
  syncing: '🎙️ O\'zbekcha ovoz tayyorlanmoqda',
  synthesizing: '🎙️ O\'zbekcha ovoz tayyorlanmoqda',
  merging: '✨ Darsingiz tayyorlanmoqda',
};

// Mirrors mobile/app/video/[id].tsx's estimateAmount (display-only estimate;
// the authoritative amount comes back from initiate-payment).
function estimateAmount(durationMinutes: number): number {
  if (durationMinutes < 45) return 0;
  return Math.ceil(durationMinutes) * 500;
}

type Tab = 'video' | 'five' | 'notes' | 'quiz' | 'qa';
const TABS: { key: Tab; label: string }[] = [
  { key: 'video', label: '🎬 Video' },
  { key: 'five', label: '⚡ 5 daqiqada' },
  { key: 'notes', label: '📝 Konspekt' },
  { key: 'quiz', label: '🧠 Test' },
  { key: 'qa', label: '💬 AI Ustoz' },
];

export default function LearnScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error } = useDubbingJob(id);
  const { data: analysis } = useAnalysisJob(job?.linked_analysis_id ?? undefined);

  const dubbedPlayerRef = useRef<DubbedVideoPlayerHandle>(null);
  const youtubePlayerRef = useRef<AnalysisVideoPlayerHandle>(null);
  const hasUserPickedTab = useRef(false);

  const [tab, setTab] = useState<Tab>('video');
  const [now, setNow] = useState(Date.now());
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number } | null>(null);

  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const isDone = job?.status === 'completed';
  const analysisReady = analysis?.status === 'completed';
  const youtubeVideoId = job?.youtube_url ? extractYouTubeId(job.youtube_url) : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (analysis?.notes) setNotes(analysis.notes);
    if (analysis?.quiz) setQuiz(analysis.quiz);
    if (analysis?.qa_history) setQaHistory(analysis.qa_history);
  }, [analysis]);

  // Video ham, tahlil ham allaqachon tayyor bo'lsa (masalan avval tugagan
  // darsni qayta ochish) -- "5 daqiqada"dan boshlash tabiiyroq, lekin
  // foydalanuvchi o'zi biror tabni tanlagan bo'lsa hech qachon undan
  // yulib olinmaydi (mirrors frontend/app/learn/[id]/page.tsx).
  useEffect(() => {
    if (hasUserPickedTab.current) return;
    if (job?.status === 'completed' && analysis?.status === 'completed') {
      setTab('five');
    }
  }, [job?.status, analysis?.status]);

  const handleTabChange = (next: Tab) => {
    hasUserPickedTab.current = true;
    setTab(next);
  };

  const seek = (seconds: number) => {
    if (job?.status === 'completed') {
      dubbedPlayerRef.current?.seekTo(seconds);
    } else {
      youtubePlayerRef.current?.seekTo(seconds);
    }
  };

  const clickMutation = useMutation({
    mutationFn: () => dubbingApi.initiateClickPayment(id),
    onSuccess: async (data) => {
      setPaymentError(null);
      if (data.payment_url) await Linking.openURL(data.payment_url);
    },
    onError: (err) => setPaymentError(getErrorMessage(err, "To'lov havolasini yaratishda xatolik yuz berdi.")),
  });

  const paymeMutation = useMutation({
    mutationFn: () => dubbingApi.initiatePaymePayment(id),
    onSuccess: async (data) => {
      setPaymentError(null);
      if (data.payment_url) await Linking.openURL(data.payment_url);
    },
    onError: (err) => setPaymentError(getErrorMessage(err, "To'lov havolasini yaratishda xatolik yuz berdi.")),
  });

  const uzumMutation = useMutation({
    mutationFn: () => dubbingApi.initiateUzumPayment(id),
    onSuccess: (data) => {
      setPaymentError(null);
      if (data.account) setUzumAccount({ account: data.account, amount: data.amount });
    },
    onError: (err) => setPaymentError(getErrorMessage(err, "To'lov ma'lumotini olishda xatolik yuz berdi.")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => dubbingApi.cancelJob(id),
  });

  const handleGenerateNotes = async () => {
    if (!job?.linked_analysis_id) return;
    setNotesLoading(true);
    try {
      const res = await analysisApi.generateNotes(job.linked_analysis_id);
      setNotes(res.notes);
    } catch {
      Alert.alert('Xatolik', 'Konspekt yaratishda xatolik yuz berdi.');
    } finally {
      setNotesLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!job?.linked_analysis_id) return;
    setQuizLoading(true);
    try {
      const res = await analysisApi.generateQuiz(job.linked_analysis_id);
      setQuiz(res.quiz);
    } catch {
      Alert.alert('Xatolik', 'Test yaratishda xatolik yuz berdi.');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!job?.linked_analysis_id || !question.trim()) return;
    setAsking(true);
    try {
      const entry = await analysisApi.askQuestion(job.linked_analysis_id, question.trim());
      setQaHistory((prev) => [...prev, entry]);
      setQuestion('');
    } catch {
      Alert.alert('Xatolik', 'Savolga javob berishda xatolik yuz berdi.');
    } finally {
      setAsking(false);
    }
  };

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
            {isLoading && <ActivityIndicator color={colors.accent} />}
            {error && (
              <ThemedText style={{ color: colors.danger, textAlign: 'center' }}>
                {getErrorMessage(error, 'Dars topilmadi.')}
              </ThemedText>
            )}

            {job && (
              <>
                <ThemedText style={styles.title}>{job.video_title || 'Video'}</ThemedText>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {TABS.map((t) => (
                    <Pressable
                      key={t.key}
                      onPress={() => handleTabChange(t.key)}
                      style={[styles.tab, tab === t.key && { backgroundColor: colors.background }]}
                    >
                      <ThemedText style={[styles.tabLabel, tab === t.key && { color: colors.accent }]}>{t.label}</ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>

                {tab === 'video' && (
                  <ThemedView style={{ gap: 12 }}>
                    {isDone ? (
                      <DubbedVideoPlayer ref={dubbedPlayerRef} uri={dubbingApi.getVideoUrl(id)} title={job.video_title} />
                    ) : job.status === 'awaiting_payment' ? (
                      <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <ThemedText style={styles.cardTitle}>To&apos;lov kutilmoqda</ThemedText>
                        <ThemedText variant="secondary" style={styles.cardText}>
                          Ushbu video 45 daqiqa yoki undan uzun bo&apos;lgani sababli, dublyaj xizmati pullik.
                        </ThemedText>
                        <ThemedView style={styles.row}>
                          <ThemedView style={styles.rowItem}>
                            <ThemedText variant="secondary" style={styles.label}>
                              Davomiylik
                            </ThemedText>
                            <ThemedText style={styles.value}>
                              {job.video_duration ? formatDuration(job.video_duration) : "Noma'lum"}
                            </ThemedText>
                          </ThemedView>
                          <ThemedView style={styles.rowItem}>
                            <ThemedText variant="secondary" style={styles.label}>
                              Xizmat haqi
                            </ThemedText>
                            <ThemedText style={[styles.value, { color: colors.accent }]}>
                              {job.video_duration
                                ? `${estimateAmount(job.video_duration / 60).toLocaleString('uz-UZ')} so'm`
                                : "Noma'lum"}
                            </ThemedText>
                          </ThemedView>
                        </ThemedView>
                        {paymentError && (
                          <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
                            {paymentError}
                          </ThemedText>
                        )}
                        {uzumAccount ? (
                          <ThemedView style={[styles.uzumBox, { borderColor: colors.accent, backgroundColor: colors.background }]}>
                            <ThemedText variant="secondary" style={styles.cardText}>
                              Uzum ilovasida to&apos;lov uchun quyidagi hisob raqamini kiriting:
                            </ThemedText>
                            <ThemedText selectable style={[styles.uzumAccountNumber, { color: colors.accent }]}>
                              {uzumAccount.account}
                            </ThemedText>
                            <ThemedText variant="secondary" style={styles.cardText}>
                              Summa: {uzumAccount.amount.toLocaleString('uz-UZ')} so&apos;m
                            </ThemedText>
                          </ThemedView>
                        ) : (
                          <ThemedView style={{ width: '100%', gap: 10 }}>
                            <PrimaryButton
                              label="Click orqali to'lov qilish"
                              onPress={() => clickMutation.mutate()}
                              loading={clickMutation.isPending}
                            />
                            <PrimaryButton
                              label="Payme orqali to'lov qilish"
                              variant="secondary"
                              onPress={() => paymeMutation.mutate()}
                              loading={paymeMutation.isPending}
                            />
                            <PrimaryButton
                              label="Uzum orqali to'lash"
                              variant="secondary"
                              onPress={() => uzumMutation.mutate()}
                              loading={uzumMutation.isPending}
                            />
                          </ThemedView>
                        )}
                      </ThemedView>
                    ) : job.status === 'failed' ? (
                      <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        {job.fallback_available ? (
                          <UploadRecoveryPrompt jobId={id} />
                        ) : (
                          <>
                            <ThemedText style={[styles.cardTitle, { color: colors.danger }]}>Xatolik yuz berdi</ThemedText>
                            <ThemedText variant="secondary" style={styles.cardText}>
                              {job.error_message || "Tizimda noma'lum xatolik yuz berdi."}
                            </ThemedText>
                          </>
                        )}
                        <PrimaryButton label="Yangi urinish" onPress={() => router.replace('/')} />
                      </ThemedView>
                    ) : (
                      <>
                        {youtubeVideoId ? (
                          <AnalysisVideoPlayer ref={youtubePlayerRef} videoId={youtubeVideoId} />
                        ) : (
                          <ThemedView style={[styles.playerFallback, { backgroundColor: colors.surface }]}>
                            <ThemedText variant="secondary">Video ko&apos;rsatib bo&apos;lmadi</ThemedText>
                          </ThemedView>
                        )}
                        <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                          <CircularProgress progress={job.progress || 0} color={colors.accent} trackColor={colors.border} />
                          <ThemedText style={styles.cardTitle}>
                            {PROCESSING_LABELS[job.status] || JOB_STATUS_LABELS[job.status]}
                          </ThemedText>
                          <ThemedText variant="secondary" style={styles.cardText}>
                            O&apos;zbekcha dublyaj tayyorlanmoqda — hozircha original videoni tomosha qilib turing.
                          </ThemedText>
                          {job.expected_end_time &&
                            (() => {
                              const remaining = Math.ceil((new Date(job.expected_end_time).getTime() - now) / 1000);
                              return (
                                <ThemedText variant="secondary" style={styles.eta}>
                                  {remaining <= 0 ? 'Tez orada yakunlanadi...' : `Taxminan ${formatRemainingTime(remaining)} qoldi`}
                                </ThemedText>
                              );
                            })()}
                          {ACTIVE_STATUSES.includes(job.status) && (
                            <>
                              <ThemedView style={[styles.stepsDivider, { backgroundColor: colors.border }]} />
                              <ProgressSteps status={job.status} />
                              <PrimaryButton
                                label="Bekor qilish"
                                variant="secondary"
                                onPress={() => cancelMutation.mutate()}
                                loading={cancelMutation.isPending}
                              />
                            </>
                          )}
                        </ThemedView>
                      </>
                    )}
                  </ThemedView>
                )}

                {tab === 'five' && <FiveMinuteSummary summary={analysis?.five_minute_summary} loading={!analysisReady} />}

                {tab === 'notes' && (
                  <ThemedView>
                    {notes ? (
                      <ThemedText style={styles.notesText}>{notes}</ThemedText>
                    ) : (
                      <Pressable
                        onPress={handleGenerateNotes}
                        disabled={notesLoading || !job.linked_analysis_id}
                        style={[styles.generateButton, { backgroundColor: colors.accentGlow, opacity: notesLoading ? 0.6 : 1 }]}
                      >
                        {notesLoading && <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} />}
                        <ThemedText style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                          {notesLoading ? 'Yaratilmoqda...' : 'Konspekt tuzish'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </ThemedView>
                )}

                {tab === 'quiz' && (
                  <QuizFlow
                    quiz={quiz}
                    loading={quizLoading}
                    answers={quizAnswers}
                    onGenerate={handleGenerateQuiz}
                    onAnswer={(qi, oi) => setQuizAnswers((prev) => ({ ...prev, [qi]: oi }))}
                    onSeek={seek}
                  />
                )}

                {tab === 'qa' && (
                  <ThemedView style={{ gap: 14 }}>
                    <ThemedView style={{ gap: 16 }}>
                      {qaHistory.length === 0 && <ThemedText variant="secondary">AI Ustozdan video haqida savol bering.</ThemedText>}
                      {qaHistory.map((qa, i) => (
                        <ThemedView key={i} style={{ gap: 6 }}>
                          <ThemedText style={styles.cardTitle}>{qa.question}</ThemedText>
                          <ThemedText variant="secondary" style={styles.notesText}>
                            {qa.answer}
                          </ThemedText>
                        </ThemedView>
                      ))}
                    </ThemedView>
                    <ThemedView style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={question}
                        onChangeText={setQuestion}
                        onSubmitEditing={handleAsk}
                        returnKeyType="send"
                        placeholder="AI Ustozdan so'rang..."
                        placeholderTextColor={colors.textSecondary}
                        style={[
                          styles.textInput,
                          { flex: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary },
                        ]}
                      />
                      <Pressable
                        onPress={handleAsk}
                        disabled={asking || !question.trim()}
                        style={[styles.sendButton, { backgroundColor: colors.accentGlow, opacity: asking || !question.trim() ? 0.5 : 1 }]}
                      >
                        {asking ? <ActivityIndicator color={colors.accent} /> : <ThemedText style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>➤</ThemedText>}
                      </Pressable>
                    </ThemedView>
                  </ThemedView>
                )}
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
  content: { flexGrow: 1, padding: 20, gap: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  tabs: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  tab: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12, alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  cardText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  row: { flexDirection: 'row', width: '100%', gap: 12 },
  rowItem: { flex: 1, gap: 2 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: '700' },
  eta: { fontSize: 12, fontWeight: '600' },
  stepsDivider: { height: StyleSheet.hairlineWidth, width: '100%' },
  uzumBox: { width: '100%', borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 8, alignItems: 'center' },
  uzumAccountNumber: { fontSize: 26, fontWeight: '800', letterSpacing: 1 },
  playerFallback: { aspectRatio: 16 / 9, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notesText: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  generateButton: { flexDirection: 'row', alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontWeight: '500' },
  sendButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
