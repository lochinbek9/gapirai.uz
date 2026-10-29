import { useMutation } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as dubbingApi from '../../src/features/dubbing/api';
import { DubbedVideoPlayer } from '../../src/features/dubbing/components/VideoPlayer';
import { useDubbingJob } from '../../src/features/dubbing/hooks/useDubbingJob';
import { JOB_STATUS_LABELS } from '../../src/features/dubbing/types';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDuration, formatRemainingTime } from '../../src/utils/format';

const ACTIVE_STATUSES = ['pending', 'downloading', 'transcribing', 'translating', 'synthesizing', 'syncing', 'merging'];

// Mirrors backend/services/click_service.py's calculate_price formula for
// display purposes only — GET /api/jobs/{id} doesn't return the amount, and
// neither does frontend/app/video/[id]/page.tsx's equivalent client-side
// estimate. The authoritative amount comes back from initiate-payment.
function estimateAmount(durationMinutes: number): number {
  if (durationMinutes < 45) return 0;
  return Math.ceil(durationMinutes) * 500;
}

export default function VideoJobScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error } = useDubbingJob(id);
  const [now, setNow] = useState(Date.now());
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const paymentMutation = useMutation({
    mutationFn: () => dubbingApi.initiateClickPayment(id),
    onSuccess: async (data) => {
      setPaymentError(null);
      if (data.payment_url) await Linking.openURL(data.payment_url);
    },
    onError: (err) => setPaymentError(getErrorMessage(err, "To'lov havolasini yaratishda xatolik yuz berdi.")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => dubbingApi.cancelJob(id),
  });

  // SRT'ni Telegram / Fayllar / CapCut ... ga ulashish (faqat subtitr va dublaj job'larida)
  const shareSrtMutation = useMutation({
    mutationFn: async () => {
      const uri = await dubbingApi.downloadSubtitleFile(id, job?.video_title);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Bu qurilmada ulashish mavjud emas.');
      await Sharing.shareAsync(uri, { mimeType: 'application/x-subrip', dialogTitle: 'Oʻzbekcha subtitr' });
    },
  });

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
                {getErrorMessage(error, 'Job topilmadi.')}
              </ThemedText>
            )}

            {job && (
              <>
                {job.status === 'completed' && !job.subtitle_only && (
                  <DubbedVideoPlayer uri={dubbingApi.getVideoUrl(id)} title={job.video_title} />
                )}

                <ThemedText style={styles.title}>{job.video_title || 'Video'}</ThemedText>

                {job.status === 'awaiting_payment' && (
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
                    <PrimaryButton
                      label="Click orqali to'lov qilish"
                      onPress={() => paymentMutation.mutate()}
                      loading={paymentMutation.isPending}
                    />
                  </ThemedView>
                )}

                {ACTIVE_STATUSES.includes(job.status) && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ActivityIndicator color={colors.accent} style={{ marginBottom: 4 }} />
                    <ThemedText style={styles.cardTitle}>{JOB_STATUS_LABELS[job.status]}</ThemedText>
                    {job.status_message && (
                      <ThemedText variant="secondary" style={styles.cardText}>
                        {job.status_message}
                      </ThemedText>
                    )}
                    <ThemedView style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <ThemedView
                        style={[styles.progressFill, { backgroundColor: colors.accent, width: `${job.progress || 0}%` }]}
                      />
                    </ThemedView>
                    {job.expected_end_time &&
                      (() => {
                        const remaining = Math.ceil((new Date(job.expected_end_time).getTime() - now) / 1000);
                        return (
                          <ThemedText variant="secondary" style={styles.eta}>
                            Taxminan {formatRemainingTime(remaining)} qoldi
                          </ThemedText>
                        );
                      })()}
                    <PrimaryButton
                      label="Bekor qilish"
                      variant="secondary"
                      onPress={() => cancelMutation.mutate()}
                      loading={cancelMutation.isPending}
                    />
                  </ThemedView>
                )}

                {job.status === 'completed' && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ThemedText style={styles.cardTitle}>
                      {job.subtitle_only ? 'Oʻzbekcha subtitr tayyor' : 'Oʻzbekcha subtitr'}
                    </ThemedText>
                    <ThemedText variant="secondary" style={styles.cardText}>
                      SRT fayl — Telegram, Fayllar yoki CapCut kabi montaj ilovalariga yuboring.
                    </ThemedText>
                    <PrimaryButton
                      label="Subtitrni ulashish (SRT)"
                      variant={job.subtitle_only ? 'primary' : 'secondary'}
                      onPress={() => shareSrtMutation.mutate()}
                      loading={shareSrtMutation.isPending}
                    />
                    {shareSrtMutation.isError && (
                      <ThemedText style={[styles.note, { color: colors.danger }]}>
                        {(shareSrtMutation.error as Error).message || 'Subtitrni ulashib boʻlmadi.'}
                      </ThemedText>
                    )}
                  </ThemedView>
                )}

                {job.status === 'completed' && job.video_duration && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ThemedText variant="secondary" style={styles.cardText}>
                      Davomiylik: {formatDuration(job.video_duration)}
                    </ThemedText>
                  </ThemedView>
                )}

                {job.status === 'failed' && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ThemedText style={[styles.cardTitle, { color: colors.danger }]}>Xatolik yuz berdi</ThemedText>
                    <ThemedText variant="secondary" style={styles.cardText}>
                      {job.error_message || "Tizimda noma'lum xatolik yuz berdi."}
                    </ThemedText>
                    <PrimaryButton label="Yangi urinish" onPress={() => router.replace('/')} />
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
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12, alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  row: { flexDirection: 'row', width: '100%', gap: 12 },
  rowItem: { flex: 1, gap: 2 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: '700' },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  eta: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
});
