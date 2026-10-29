import { useMutation } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Check, Clock, Mic2, Share2, ShieldAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '../../src/api/errors';
import { Card } from '../../src/components/Card';
import { Notice } from '../../src/components/Notice';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { ThemedText } from '../../src/components/ThemedText';
import * as dubbingApi from '../../src/features/dubbing/api';
import { DubbedVideoPlayer } from '../../src/features/dubbing/components/VideoPlayer';
import { useDubbingJob } from '../../src/features/dubbing/hooks/useDubbingJob';
import { JOB_STATUS_LABELS, type Job } from '../../src/features/dubbing/types';
import { alpha, radius } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDateTime, formatDuration, formatNumber, formatRemainingTime } from '../../src/utils/format';

// frontend/app/video/[id]/page.tsx bilan bir xil: jarayon kartasi (4 bosqich) yoki
// pleyer, ostida sarlavha + ovoz ma'lumoti, yuklab olish/ulashish, "Video ma'lumotlari".

// Mirrors backend/services/click_service.py's calculate_price formula for display only —
// the authoritative amount comes back from initiate-payment.
function estimateAmount(durationMinutes: number): number {
  if (durationMinutes < 45) return 0;
  return Math.ceil(durationMinutes) * 500;
}

const STAGES = ['Yuklab olish', 'Matn & Tarjima', 'Ovoz yaratish', 'Montaj'];

function activeStage(job: Job): { index: number; label: string } {
  const p = job.progress || 0;
  if (job.status === 'pending' || job.status === 'downloading' || p < 15) return { index: 0, label: 'Yuklanmoqda' };
  if (job.status === 'transcribing' || job.status === 'translating' || job.status === 'syncing' || p < 50)
    return { index: 1, label: 'Matn tayyorlanmoqda' };
  if (job.status === 'synthesizing' || p < 85) return { index: 2, label: 'Ovoz yozilmoqda' };
  return { index: 3, label: 'Montaj qilinmoqda' };
}

function friendlyError(code?: string, message?: string): string {
  const m = message?.toLowerCase() ?? '';
  if (code === 'USER_CANCELLED' || m.includes('user cancelled') || m.includes('bekor qilindi'))
    return 'Dublyaj jarayoni foydalanuvchi tomonidan bekor qilindi.';
  if (code === 'NO_SPEECH_FOUND' || m.includes('nutq topilmadi')) return 'Ushbu videoda inson nutqi yoki suhbat aniqlanmadi.';
  if (code === 'CONTENT_BLOCKED' || m.includes('kontent') || m.includes('taqiqlangan'))
    return 'Video xavfsizlik va kontent siyosatimiz talablariga mos kelmagani sababli toʻxtatildi.';
  if (code === 'TTS_FAILED') return 'Ovoz sintez qilish (TTS) xizmatida texnik uzilish yuz berdi. Iltimos, qaytadan urinib koʻring.';
  if (code === 'TRANSCRIBE_FAILED') return 'Video audiosini matnga aylantirishda xatolik yuz berdi. Iltimos, qaytadan urinib koʻring.';
  if (code === 'TRANSLATE_FAILED') return 'Matnni oʻzbek tiliga tarjima qilish jarayonida xatolik yuz berdi.';
  return message || 'Tizimda nomaʼlum xatolik yuz berdi.';
}

function isYoutubeRestricted(job: Job): boolean {
  const m = job.error_message?.toLowerCase() ?? '';
  return (
    ['AUTH_ERROR', 'DOWNLOAD_FAILED', 'HTTP_403', 'PO_TOKEN_REQUIRED'].includes(job.error_code ?? '') ||
    m.includes('bot') ||
    m.includes('sign in') ||
    m.includes('ruxsat') ||
    m.includes('private')
  );
}

// Saytdagi getElapsedSeconds: oxirgi yangilanish yoki yaratilgan vaqtdan (1 soat ichida bo'lsa),
// aks holda shu sahifa ochilgan vaqtdan -- eski job qayta ishlansa "76:05" kabi noo'rin raqam chiqmasin.
function elapsedSeconds(job: Job, now: number, sessionStart: number): number {
  for (const iso of [job.updated_at, job.created_at]) {
    if (!iso) continue;
    const diff = (now - new Date(iso).getTime()) / 1000;
    if (diff >= 0 && diff < 3600) return Math.floor(diff);
  }
  return Math.max(0, Math.floor((now - sessionStart) / 1000));
}

function formatElapsed(sec: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${p(h)}:${p(m)}:${p(sec % 60)}` : `${p(m)}:${p(sec % 60)}`;
}

const providerLabel = (p?: string) => {
  const v = (p || 'azure').toLowerCase();
  return v === 'gemini' ? 'GapirAI HD' : v === 'edge' ? 'Standart' : 'Neural HD';
};
const cleanVoice = (v: string) => v.replace('uz-UZ-', '').replace('Neural', '');

export default function VideoJobScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error } = useDubbingJob(id);
  const [now, setNow] = useState(Date.now());
  const sessionStart = useRef(Date.now()).current;
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
    onError: (err) => setPaymentError(getErrorMessage(err, 'Toʻlov havolasini yaratishda xatolik yuz berdi.')),
  });

  const cancelMutation = useMutation({ mutationFn: () => dubbingApi.cancelJob(id) });

  // SRT'ni Telegram / Fayllar / CapCut ... ga ulashish
  const shareSrtMutation = useMutation({
    mutationFn: async () => {
      const uri = await dubbingApi.downloadSubtitleFile(id, job?.video_title);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Bu qurilmada ulashish mavjud emas.');
      await Sharing.shareAsync(uri, { mimeType: 'application/x-subrip', dialogTitle: 'Oʻzbekcha subtitr' });
    },
  });

  if (isLoading || error || !job) {
    return (
      <Screen contentStyle={styles.centerFill}>
        {error ? <Notice>{getErrorMessage(error, 'Video topilmadi.')}</Notice> : <ActivityIndicator color={colors.muted} />}
      </Screen>
    );
  }

  const active = !['completed', 'failed', 'awaiting_payment'].includes(job.status);
  const voiceLine =
    job.speaker_gender && !job.subtitle_only
      ? `${job.speaker_gender === 'female' ? 'Ayol ovozi' : 'Erkak ovozi'} (${cleanVoice(
          job.voice_name ||
            ((job.tts_provider || 'azure').toLowerCase() === 'gemini'
              ? job.speaker_gender === 'female'
                ? 'Autonoe'
                : 'Charon'
              : job.speaker_gender === 'female'
                ? 'Madina'
                : 'Sardor'),
        )} • ${providerLabel(job.tts_provider)})`
      : null;

  return (
    <Screen contentStyle={styles.content}>
      {active && (
        <ProcessingCard job={job} now={now} sessionStart={sessionStart} onCancel={() => cancelMutation.mutate()} cancelling={cancelMutation.isPending} />
      )}

      {job.status === 'failed' && <FailedCard job={job} onHome={() => router.replace('/')} />}

      {job.status === 'awaiting_payment' && (
        <Card style={styles.gap16}>
          <ThemedText accessibilityRole="header" style={styles.cardTitle}>
            Toʻlov kutilmoqda
          </ThemedText>
          <ThemedText variant="secondary" style={styles.body}>
            Ushbu video 45 daqiqa yoki undan uzun boʻlgani sababli, dublyaj xizmati pullik.
          </ThemedText>
          <View style={styles.infoBox}>
            <InfoRow label="Davomiylik" value={job.video_duration ? formatDuration(job.video_duration) : 'Nomaʼlum'} />
            <InfoRow
              label="Xizmat haqi"
              value={job.video_duration ? `${formatNumber(estimateAmount(job.video_duration / 60))} soʻm` : 'Nomaʼlum'}
            />
          </View>
          {paymentError && <Notice>{paymentError}</Notice>}
          <PrimaryButton label="Click orqali toʻlov qilish" onPress={() => paymentMutation.mutate()} loading={paymentMutation.isPending} />
        </Card>
      )}

      {job.status === 'completed' && !job.subtitle_only && (
        <View style={styles.player}>
          <DubbedVideoPlayer uri={dubbingApi.getVideoUrl(id)} title={job.video_title} />
        </View>
      )}

      <View>
        <ThemedText accessibilityRole="header" style={styles.title}>
          {job.video_title || 'Nomaʼlum video'}
        </ThemedText>
        <View style={styles.metaRow}>
          {job.video_duration ? (
            <View style={styles.metaItem}>
              <Clock size={16} color={colors.muted} strokeWidth={2} />
              <ThemedText variant="secondary" style={[styles.meta, styles.tabular]}>
                {formatDuration(job.video_duration)}
              </ThemedText>
            </View>
          ) : null}
          {voiceLine && (
            <View style={[styles.metaItem, styles.shrink]}>
              <Mic2 size={16} color={colors.accentInk} strokeWidth={2} />
              <ThemedText variant="secondary" style={[styles.meta, styles.shrink, { fontWeight: '500' }]}>
                {voiceLine}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {job.status === 'completed' && job.content_flagged && (
        <Notice tone="warning" icon={AlertTriangle}>
          Video tayyor va shaxsiy foydalanish uchun mavjud. Ammo kontent siyosatimizga koʻra (diniy, 18+, zoʻravonlik yoki shunga
          oʻxshash kategoriya) bunday videolarni keyingi safar yubormaslikni soʻraymiz.
        </Notice>
      )}

      {job.status === 'completed' && (
        <Card style={styles.gap12}>
          <ThemedText variant="secondary" style={styles.sectionLabel}>
            {job.subtitle_only ? 'Oʻzbekcha subtitr tayyor' : 'Yuklab olish'}
          </ThemedText>
          <ThemedText variant="secondary" style={styles.small}>
            SRT fayl — Telegram, Fayllar yoki CapCut kabi montaj ilovalariga yuboring.
          </ThemedText>
          <PrimaryButton
            label="Subtitrni ulashish (SRT)"
            icon={Share2}
            variant={job.subtitle_only ? 'primary' : 'secondary'}
            onPress={() => shareSrtMutation.mutate()}
            loading={shareSrtMutation.isPending}
          />
          {shareSrtMutation.isError && <Notice>{(shareSrtMutation.error as Error).message || 'Subtitrni ulashib boʻlmadi.'}</Notice>}
        </Card>
      )}

      <View style={styles.gap12}>
        <ThemedText accessibilityRole="header" style={styles.h2}>
          Video maʼlumotlari
        </ThemedText>
        <Card style={styles.gap14}>
          <InfoRow label="Holat" value={job.status === 'failed' ? 'Xatolik' : JOB_STATUS_LABELS[job.status] || job.status} />
          {job.video_duration ? <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} /> : null}
          {job.subtitle_only ? <InfoRow label="Natija" value="Faqat subtitr" /> : null}
          {job.speaker_gender ? <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? 'Ayol' : 'Erkak'} /> : null}
          {job.tts_provider && !job.subtitle_only ? <InfoRow label="Ovoz dvigateli" value={providerLabel(job.tts_provider)} /> : null}
          {job.voice_name && !job.subtitle_only ? <InfoRow label="Ovoz egasi" value={cleanVoice(job.voice_name)} /> : null}
          {job.created_at ? (
            <InfoRow
              label="Yuborilgan"
              value={formatDateTime(job.created_at)}
            />
          ) : null}
          {job.uzbek_srt_content ? <InfoRow label="Subtitr" value="Mavjud" /> : null}
        </Card>
      </View>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText variant="secondary" style={styles.small}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.small, styles.infoValue]}>{value}</ThemedText>
    </View>
  );
}

function Pill({ children, dot }: { children: string; dot?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { borderColor: colors.rule }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: dot }]} /> : <Clock size={14} color={colors.muted} strokeWidth={2} />}
      <ThemedText style={[styles.pillText, !dot && { color: colors.muted }, styles.tabular]}>{children}</ThemedText>
    </View>
  );
}

function ProcessingCard({
  job,
  now,
  sessionStart,
  onCancel,
  cancelling,
}: {
  job: Job;
  now: number;
  sessionStart: number;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { colors } = useTheme();
  const queued = job.status === 'pending' || (job.progress || 0) <= 0;
  const stage = activeStage(job);
  const elapsed = elapsedSeconds(job, now, sessionStart);
  const remaining = job.expected_end_time ? Math.ceil((new Date(job.expected_end_time).getTime() - now) / 1000) : null;

  return (
    <Card style={styles.processing}>
      <View style={styles.pillRow}>
        <Pill dot={queued ? '#FBBF24' : '#10B981'}>{queued ? 'Navbatda turibdi' : 'Sunʼiy intellekt ishlamoqda'}</Pill>
        <Pill>{formatElapsed(elapsed)}</Pill>
      </View>

      <View style={styles.gap8}>
        <ThemedText style={styles.processingTitle}>
          {job.status_message || (queued ? 'Video navbatda kutilmoqda...' : 'Video qayta ishlanmoqda...')}
        </ThemedText>
        <ThemedText variant="secondary" style={[styles.small, styles.center]}>
          Sahifani yopsangiz ham jarayon davom etadi — tayyor video «Mening videolarim» boʻlimida saqlanadi.
        </ThemedText>
      </View>

      <View style={styles.gap8}>
        <View style={styles.progressHead}>
          <ThemedText style={[styles.xs, { fontWeight: '500' }]}>
            {queued ? 'Tayyorgarlik' : `Bosqich ${stage.index + 1}/4: ${stage.label}`}
          </ThemedText>
          <ThemedText style={[styles.xs, styles.tabular, { color: queued ? '#D97706' : colors.accentInk, fontWeight: '600' }]}>
            {queued ? 'Tez orada boshlanadi' : `${Math.round(job.progress || 0)}%`}
          </ThemedText>
        </View>
        <View style={[styles.track, { backgroundColor: colors.ground }]}>
          <View
            style={[
              styles.fill,
              queued
                ? { width: '100%', backgroundColor: alpha(colors.accent, 0.2) }
                : { width: `${Math.max(5, Math.min(100, job.progress || 0))}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
      </View>

      <View style={styles.stageGrid}>
        {STAGES.map((label, i) => {
          const done = stage.index > i && !queued;
          const current = stage.index === i && !queued;
          return (
            <View
              key={label}
              style={[
                styles.stage,
                { borderColor: current ? colors.accent : colors.rule },
                current && { borderWidth: 2, padding: 9 },
              ]}
            >
              {done ? (
                <View style={styles.stageStatus}>
                  <Check size={14} color={colors.greenInk} strokeWidth={2} />
                  <ThemedText style={[styles.xs, { color: colors.greenInk, fontWeight: '500' }]}>Tayyor</ThemedText>
                </View>
              ) : current ? (
                <View style={styles.stageStatus}>
                  <View style={[styles.pillDot, { backgroundColor: colors.accent, width: 6, height: 6 }]} />
                  <ThemedText style={[styles.xs, { color: colors.accentInk, fontWeight: '500' }]}>Bajarilmoqda</ThemedText>
                </View>
              ) : (
                <ThemedText variant="secondary" style={styles.xs}>
                  Kutilmoqda
                </ThemedText>
              )}
              <ThemedText numberOfLines={1} style={[styles.stageLabel, !done && !current && { color: colors.muted }]}>
                {label}
              </ThemedText>
            </View>
          );
        })}
      </View>

      {remaining !== null && !queued && (
        <View style={[styles.etaBox, { borderColor: colors.rule, backgroundColor: colors.ground }]}>
          <ThemedText variant="secondary" style={[styles.xs, { fontWeight: '600' }]}>
            {remaining <= 0 ? 'Tez orada yakunlanadi...' : `Taxminan ${formatRemainingTime(remaining)} qoldi`}
          </ThemedText>
        </View>
      )}

      <PrimaryButton label="Jarayonni bekor qilish" variant="secondary" size="sm" fullWidth={false} onPress={onCancel} loading={cancelling} style={styles.selfCenter} />
    </Card>
  );
}

function FailedCard({ job, onHome }: { job: Job; onHome: () => void }) {
  const { colors } = useTheme();
  const restricted = isYoutubeRestricted(job);
  const amber = '#F59E0B';
  const tint = restricted ? amber : colors.accent;
  const Icon = restricted ? ShieldAlert : AlertTriangle;
  return (
    <Card style={[styles.failed, restricted && { borderColor: alpha(amber, 0.3) }]}>
      <View style={[styles.failedIcon, { backgroundColor: alpha(tint, 0.1) }]}>
        <Icon size={32} color={restricted ? '#D97706' : colors.accentInk} strokeWidth={2} />
      </View>
      <View style={[styles.tag, { backgroundColor: alpha(tint, 0.1) }]}>
        <ThemedText style={[styles.xs, { fontWeight: '600', color: restricted ? '#D97706' : colors.accentInk }]}>
          {restricted ? 'YouTube cheklovi' : 'Xatolik'}
        </ThemedText>
      </View>
      <ThemedText style={styles.failedTitle}>
        {restricted ? 'Ushbu video YouTube himoyasi bilan cheklangan' : 'Kutilmagan xatolik yuz berdi'}
      </ThemedText>
      <ThemedText variant="secondary" style={[styles.small, styles.center]}>
        {restricted
          ? 'Videoni telefoningizdan fayl sifatida yuklab, dublyajni davom ettirishingiz mumkin (bosh sahifa → Fayl).'
          : friendlyError(job.error_code, job.error_message)}
      </ThemedText>
      <PrimaryButton label={restricted ? 'Boshqa video yoki fayl yuborish' : 'Bosh sahifa'} onPress={onHome} />
    </Card>
  );
}

const styles = StyleSheet.create({
  centerFill: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 96, gap: 24 },
  player: { marginHorizontal: -16 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap14: { gap: 14 },
  gap16: { gap: 16 },
  center: { textAlign: 'center' },
  selfCenter: { alignSelf: 'center' },
  shrink: { flexShrink: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '600' },
  h2: { fontSize: 16, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 14 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  xs: { fontSize: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '600' },
  infoBox: { gap: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  infoValue: { fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  processing: { padding: 24, gap: 24, minHeight: 400, justifyContent: 'center' },
  pillRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '500' },
  processingTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: { width: '48.5%', flexGrow: 1, borderWidth: 1, borderRadius: radius.control, padding: 10, gap: 6 },
  stageStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stageLabel: { fontSize: 13, fontWeight: '500' },
  etaBox: { borderWidth: 1, borderRadius: radius.control, padding: 12 },
  failed: { padding: 24, alignItems: 'center', gap: 16, minHeight: 360, justifyContent: 'center' },
  failedIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  failedTitle: { fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
});
