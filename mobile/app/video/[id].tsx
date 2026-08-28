import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getErrorMessage } from '../../src/api/errors';
import { CircularProgress } from '../../src/components/CircularProgress';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedView } from '../../src/components/ThemedView';
import * as dubbingApi from '../../src/features/dubbing/api';
import { ProgressSteps } from '../../src/features/dubbing/components/ProgressSteps';
import { ResolutionDownloadButtons } from '../../src/features/dubbing/components/ResolutionDownloadButtons';
import { UploadRecoveryPrompt } from '../../src/features/dubbing/components/UploadRecoveryPrompt';
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

  const [uzumAccount, setUzumAccount] = useState<{ account: number; amount: number } | null>(null);

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

  // Uzum has no hosted checkout — success just reveals an account number for
  // the user to enter in the Uzum app themselves (mirrors
  // frontend/app/video/[id]/page.tsx's handleUzumPayment).
  const uzumMutation = useMutation({
    mutationFn: () => dubbingApi.initiateUzumPayment(id),
    onSuccess: (data) => {
      setPaymentError(null);
      if (data.account) {
        setUzumAccount({ account: data.account, amount: data.amount });
      }
    },
    onError: (err) => setPaymentError(getErrorMessage(err, "To'lov ma'lumotini olishda xatolik yuz berdi.")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => dubbingApi.cancelJob(id),
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
                {job.status === 'completed' && (
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

                    {uzumAccount ? (
                      <ThemedView
                        style={[styles.uzumBox, { borderColor: colors.accent, backgroundColor: colors.background }]}
                      >
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
                )}

                {ACTIVE_STATUSES.includes(job.status) && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <CircularProgress progress={job.progress || 0} color={colors.accent} trackColor={colors.border} />
                    <ThemedText style={styles.cardTitle}>{JOB_STATUS_LABELS[job.status]}</ThemedText>
                    {job.status_message && (
                      <ThemedText variant="secondary" style={styles.cardText}>
                        {job.status_message}
                      </ThemedText>
                    )}
                    {job.expected_end_time &&
                      (() => {
                        const remaining = Math.ceil((new Date(job.expected_end_time).getTime() - now) / 1000);
                        // formatRemainingTime already returns "kam qoldi..." for
                        // remaining <= 0 (a job whose ETA has passed, e.g. one
                        // stuck for a long time) — appending another " qoldi"
                        // after it produced "kam qoldi... qoldi". Mirrors
                        // frontend/app/video/[id]/page.tsx's own <= 0 branch,
                        // which never appends "qoldi" in that case either.
                        return (
                          <ThemedText variant="secondary" style={styles.eta}>
                            {remaining <= 0 ? 'Tez orada yakunlanadi...' : `Taxminan ${formatRemainingTime(remaining)} qoldi`}
                          </ThemedText>
                        );
                      })()}
                    <ThemedView style={[styles.stepsDivider, { backgroundColor: colors.border }]} />
                    <ProgressSteps status={job.status} />
                    <PrimaryButton
                      label="Bekor qilish"
                      variant="secondary"
                      onPress={() => cancelMutation.mutate()}
                      loading={cancelMutation.isPending}
                    />
                  </ThemedView>
                )}

                {job.status === 'completed' && job.video_duration && (
                  <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <ThemedText variant="secondary" style={styles.cardText}>
                      Davomiylik: {formatDuration(job.video_duration)}
                    </ThemedText>
                    <ResolutionDownloadButtons jobId={id} />
                  </ThemedView>
                )}

                {job.status === 'failed' && (
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
  eta: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  stepsDivider: { height: StyleSheet.hairlineWidth, width: '100%' },
  uzumBox: { width: '100%', borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 8, alignItems: 'center' },
  uzumAccountNumber: { fontSize: 26, fontWeight: '800', letterSpacing: 1 },
});
