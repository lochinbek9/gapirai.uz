import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronRight, Crown, LogOut, Plus, Sparkles, Trash2, User2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Youtube } from '../src/components/BrandIcons';
import { Card } from '../src/components/Card';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { StatusBadge } from '../src/components/StatusBadge';
import { ThemedText } from '../src/components/ThemedText';
import * as analysisApi from '../src/features/analysis/api';
import type { VideoAnalysis } from '../src/features/analysis/types';
import * as billingApi from '../src/features/billing/api';
import type { Job } from '../src/features/dubbing/types';
import * as jobsApi from '../src/features/jobs/api';
import { useJobs } from '../src/features/jobs/hooks/useJobs';
import * as plansApi from '../src/features/plans/api';
import { PLAN_NAMES } from '../src/features/plans/types';
import { useAuthStore } from '../src/store/useAuthStore';
import { alpha, radius } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeProvider';
import { formatDate, formatDuration } from '../src/utils/format';

// frontend/app/dashboard/page.tsx bilan bir xil tuzilish: sarlavha + amallar, raqamlar,
// joriy tarif, avtomatik to'lov, Dublyaj/Tahlillar tablari, video kartalari.

type Tab = 'dubbing' | 'analysis';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [tab, setTab] = useState<Tab>('dubbing');

  const jobsQuery = useJobs();
  const analysesQuery = useQuery({ queryKey: ['analyses'], queryFn: analysisApi.listAnalyses });
  const jobs = jobsQuery.data ?? [];
  const analyses = analysesQuery.data ?? [];

  const completed = jobs.filter((j) => j.status === 'completed').length;
  const processing = jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed').length;

  const confirmDelete = (title: string, run: () => Promise<void>) =>
    Alert.alert('Oʻchirish', `"${title}" oʻchirilsinmi?`, [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'Oʻchirish',
        style: 'destructive',
        onPress: () => run().catch(() => Alert.alert('Xatolik', 'Oʻchirishda xatolik yuz berdi.')),
      },
    ]);

  const deleteJob = (job: Job) =>
    confirmDelete(job.video_title || 'Video', async () => {
      await jobsApi.deleteJob(job.job_id);
      queryClient.setQueryData<Job[]>(['jobs'], (prev) => (prev ?? []).filter((j) => j.job_id !== job.job_id));
    });

  const deleteAnalysis = (a: VideoAnalysis) =>
    confirmDelete(a.video_title || 'Video tahlili', async () => {
      await analysisApi.deleteAnalysis(a.id);
      queryClient.setQueryData<VideoAnalysis[]>(['analyses'], (prev) => (prev ?? []).filter((x) => x.id !== a.id));
    });

  const refreshing = jobsQuery.isRefetching || analysesQuery.isRefetching;
  const refresh = () => {
    jobsQuery.refetch();
    analysesQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ['plans'] });
  };

  const loading = tab === 'dubbing' ? jobsQuery.isLoading : analysesQuery.isLoading;

  return (
    <Screen
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.accent]} />}
    >
      <View>
        <ThemedText accessibilityRole="header" style={styles.h1}>
          Mening videolarim
        </ThemedText>
        {user && (
          <View style={styles.userRow}>
            <User2 size={16} color={colors.muted} strokeWidth={2} />
            <ThemedText variant="secondary" numberOfLines={1} style={styles.userName}>
              {user.name}
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Yangi video" icon={Plus} onPress={() => router.navigate('/')} style={styles.flex} />
        <PrimaryButton
          label="Chiqish"
          icon={LogOut}
          variant="secondary"
          fullWidth={false}
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
      </View>

      <View style={[styles.stats, { borderColor: colors.rule }]}>
        {(
          [
            ['Jami', jobs.length],
            ['Tayyor', completed],
            ['Jarayonda', processing],
          ] as const
        ).map(([label, value], i) => (
          <View key={label} style={[styles.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.rule }]}>
            <ThemedText variant="secondary" style={styles.statLabel}>
              {label}
            </ThemedText>
            <ThemedText style={styles.statValue}>{value}</ThemedText>
          </View>
        ))}
      </View>

      <PlanCard />
      <BillingLink />

      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          options={[
            { value: 'dubbing', label: `Dublyaj  ${jobs.length}`, icon: Youtube },
            { value: 'analysis', label: `Tahlillar  ${analyses.length}`, icon: Sparkles },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {loading ? null : tab === 'dubbing' ? (
        jobs.length === 0 ? (
          <EmptyState
            title="Hali video yoʻq"
            text="YouTube havolasini yuboring — tayyor videolar shu yerda saqlanadi."
            action="Birinchi videoni dublyaj qilish"
            onPress={() => router.navigate('/')}
          />
        ) : (
          <View style={styles.list}>
            {jobs.map((job) => (
              <JobCard key={job.job_id} job={job} onDelete={() => deleteJob(job)} />
            ))}
          </View>
        )
      ) : analyses.length === 0 ? (
        <EmptyState
          title="Hali video tahlil qilinmagan"
          text="YouTube videoning xulosasi, asosiy fikrlari va konspektini oling — daqiqa sarflamaydi."
          action="Video tahlil qilish"
          onPress={() => router.navigate('/')}
        />
      ) : (
        <View style={styles.list}>
          {analyses.map((a) => (
            <AnalysisCard key={a.id} analysis={a} onDelete={() => deleteAnalysis(a)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PlanCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['plans'], queryFn: plansApi.getPlans });
  const sub = data?.current;
  if (!sub) return null;

  const expiresSoon = !!sub.expires_at && new Date(sub.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
  const m = sub.minutes;

  return (
    <Card style={styles.planCard}>
      <View style={styles.planHead}>
        <View style={[styles.planIcon, { backgroundColor: alpha(colors.accent, 0.1) }]}>
          <Crown size={20} color={colors.accentInk} strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <ThemedText variant="secondary" style={styles.planLabel}>
            Joriy tarif
          </ThemedText>
          <ThemedText style={styles.planName}>{PLAN_NAMES[sub.plan] || sub.plan}</ThemedText>
        </View>
      </View>
      {m && (
        <View style={styles.planMeta}>
          <ThemedText variant="secondary" style={styles.small}>
            <ThemedText style={[styles.small, styles.tabular, { fontWeight: '600' }]}>{m.monthly_remaining}</ThemedText> / {m.monthly_cap}{' '}
            daqiqa qoldi (oylik)
          </ThemedText>
          {m.monthly_used > 0 && (
            <ThemedText variant="secondary" style={styles.small}>
              {m.monthly_used} daqiqa ishlatildi
            </ThemedText>
          )}
          {m.purchased > 0 && (
            <ThemedText style={[styles.small, { color: colors.accentInk, fontWeight: '600' }]}>+ {m.purchased} sotib olingan daqiqa</ThemedText>
          )}
          {sub.plan !== 'free' && sub.expires_at && (
            <ThemedText variant="secondary" style={[styles.small, expiresSoon && { color: '#D97706', fontWeight: '600' }]}>
              {formatDate(sub.expires_at)} gacha
            </ThemedText>
          )}
        </View>
      )}
      <PrimaryButton
        label={sub.plan === 'free' ? 'Tarifni oshirish' : expiresSoon ? 'Yangilash' : 'Tariflarni koʻrish'}
        icon={Crown}
        onPress={() => router.push('/pricing')}
      />
    </Card>
  );
}

function BillingLink() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['billing-overview'], queryFn: billingApi.getBillingOverview });
  if (!data || (!data.providers.click && !data.providers.payme)) return null;

  const p = data.preferences;
  const on = p.auto_renew || p.auto_topup_enabled;
  const summary = p.in_grace
    ? 'Toʻlov muammosi — kartani tekshiring'
    : on
      ? [p.auto_renew && 'obuna', p.auto_topup_enabled && 'daqiqa'].filter(Boolean).join(' + ') + ' avtomatik'
      : 'Oʻchiq — kartani bogʻlang';

  return (
    <Pressable onPress={() => router.push('/billing')} accessibilityRole="button">
      {({ pressed }) => (
        <Card style={[styles.billing, { borderColor: p.in_grace ? colors.red : colors.rule }, pressed && { backgroundColor: colors.ground }]}>
          <View style={styles.flex}>
            <ThemedText style={styles.billingTitle}>Avtomatik toʻlov</ThemedText>
            <ThemedText variant="secondary" style={styles.small}>
              {summary}
            </ThemedText>
          </View>
          <ChevronRight size={18} color={colors.muted} strokeWidth={2} />
        </Card>
      )}
    </Pressable>
  );
}

function Thumb({ uri, duration, progress, badge }: { uri?: string; duration?: number; progress?: number; badge?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: colors.ground }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.thumbEmpty}>
          <Youtube size={48} color={colors.muted} strokeWidth={1.5} />
        </View>
      )}
      {badge && (
        <View style={[styles.overlayBadge, styles.topLeft]}>
          <ThemedText style={styles.overlayText}>{badge}</ThemedText>
        </View>
      )}
      {duration ? (
        <View style={[styles.overlayBadge, styles.bottomRight]}>
          <ThemedText style={[styles.overlayText, styles.tabular]}>{formatDuration(duration)}</ThemedText>
        </View>
      ) : null}
      {progress !== undefined && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(5, Math.min(100, progress))}%`, backgroundColor: colors.accent }]} />
        </View>
      )}
    </View>
  );
}

function CardFooter({ status, errorCode, errorMessage, openLabel, onOpen, onDelete }: {
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  openLabel: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.footerRow}>
      <StatusBadge status={status} errorCode={errorCode} errorMessage={errorMessage} />
      <View style={styles.footerActions}>
        <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="link">
          <ThemedText style={[styles.small, { color: colors.accentInk, fontWeight: '600' }]}>{openLabel}</ThemedText>
        </Pressable>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Oʻchirish"
          hitSlop={6}
          style={({ pressed }) => [styles.trash, pressed && { backgroundColor: alpha(colors.red, 0.1) }]}
        >
          <Trash2 size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

function JobCard({ job, onDelete }: { job: Job; onDelete: () => void }) {
  const router = useRouter();
  const open = () => router.push(`/video/${job.job_id}`);
  const inProgress = job.status !== 'completed' && job.status !== 'failed';
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${job.video_title || 'Video'} — ochish`}>
      <Card style={styles.videoCard}>
        <Thumb
          uri={job.video_thumbnail}
          duration={job.video_duration}
          progress={inProgress ? job.progress : undefined}
          badge={job.subtitle_only ? 'Subtitr' : undefined}
        />
        <View style={styles.cardBody}>
          <ThemedText numberOfLines={2} style={styles.cardTitle}>
            {job.video_title || 'Yuklanmoqda...'}
          </ThemedText>
          <CardFooter
            status={job.status}
            errorCode={job.error_code}
            errorMessage={job.error_message}
            openLabel={job.status === 'completed' ? 'Koʻrish →' : inProgress ? 'Jarayonni koʻrish' : 'Batafsil'}
            onOpen={open}
            onDelete={onDelete}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function AnalysisCard({ analysis, onDelete }: { analysis: VideoAnalysis; onDelete: () => void }) {
  const router = useRouter();
  const open = () => router.push(`/video-analysis/${analysis.id}`);
  const inProgress = analysis.status !== 'completed' && analysis.status !== 'failed';
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${analysis.video_title || 'Video tahlili'} — ochish`}>
      <Card style={styles.videoCard}>
        <Thumb
          uri={analysis.video_thumbnail}
          duration={analysis.video_duration}
          progress={inProgress ? analysis.progress : undefined}
          badge={`AI Tahlil · ${analysis.language.toUpperCase()}`}
        />
        <View style={styles.cardBody}>
          <ThemedText numberOfLines={2} style={styles.cardTitle}>
            {analysis.video_title || 'Video tahlili'}
          </ThemedText>
          <CardFooter
            status={analysis.status}
            errorCode={analysis.error_code}
            errorMessage={analysis.error_message}
            openLabel={analysis.status === 'completed' ? 'Tahlilni koʻrish →' : 'Batafsil'}
            onOpen={open}
            onDelete={onDelete}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function EmptyState({ title, text, action, onPress }: { title: string; text: string; action: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.rule }]}>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText variant="secondary" style={styles.emptyText}>
        {text}
      </ThemedText>
      <PrimaryButton label={action} fullWidth={false} onPress={onPress} style={styles.emptyButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 96, gap: 20 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  userName: { fontSize: 15, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.card, marginTop: 12 },
  stat: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  statLabel: { fontSize: 14 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.5, marginTop: 4, fontVariant: ['tabular-nums'] },
  planCard: { gap: 16 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planLabel: { fontSize: 12, fontWeight: '600' },
  planName: { fontSize: 18, fontWeight: '600' },
  planMeta: { gap: 2 },
  small: { fontSize: 13, lineHeight: 19 },
  tabular: { fontVariant: ['tabular-nums'] },
  billing: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  billingTitle: { fontSize: 15, fontWeight: '600' },
  tabs: { marginTop: 4 },
  list: { gap: 20 },
  videoCard: { padding: 0, overflow: 'hidden' },
  thumb: { aspectRatio: 16 / 9, width: '100%', overflow: 'hidden' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlayBadge: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  topLeft: { top: 10, left: 10 },
  bottomRight: { right: 10, bottom: 10 },
  overlayText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: '100%' },
  cardBody: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', minHeight: 40 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trash: { padding: 8, borderRadius: radius.tab },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, paddingHorizontal: 24, paddingVertical: 64, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 22, marginTop: 4, textAlign: 'center', maxWidth: 320 },
  emptyButton: { marginTop: 24 },
});
