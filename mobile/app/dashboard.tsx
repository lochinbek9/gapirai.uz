import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import * as jobsApi from '../src/features/jobs/api';
import { useJobs } from '../src/features/jobs/hooks/useJobs';
import * as plansApi from '../src/features/plans/api';
import { PLAN_NAMES } from '../src/features/plans/types';
import { JOB_STATUS_LABELS, type Job } from '../src/features/dubbing/types';
import { useTheme } from '../src/theme/ThemeProvider';
import { formatDuration } from '../src/utils/format';

// Mirrors frontend/app/dashboard/page.tsx: current plan + job history, with
// delete and navigation into the existing video/[id] screen (which already
// handles every job status, not just completed).

function statusColor(status: Job['status'], colors: ReturnType<typeof useTheme>['colors']) {
  if (status === 'completed') return colors.success;
  if (status === 'failed') return colors.danger;
  return colors.accent;
}

function PlanCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['plans'], queryFn: plansApi.getPlans });
  const current = data?.current;
  if (!current) return null;

  const planName = PLAN_NAMES[current.plan] || current.plan;
  const expiresSoon =
    current.expires_at && new Date(current.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;

  return (
    <ThemedView style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ThemedView style={{ backgroundColor: 'transparent' }}>
        <ThemedText variant="secondary" style={styles.planLabel}>
          Joriy tarif
        </ThemedText>
        <ThemedText style={styles.planName}>{planName}</ThemedText>
        {current.minutes && (
          <ThemedText variant="secondary" style={styles.planMeta}>
            {current.minutes.monthly_remaining} / {current.minutes.monthly_cap} daqiqa qoldi
            {current.minutes.purchased > 0 ? ` (+${current.minutes.purchased} sotib olingan)` : ''}
            {current.plan !== 'free' && current.expires_at
              ? ` · ${new Date(current.expires_at).toLocaleDateString('uz-UZ')} gacha`
              : ''}
          </ThemedText>
        )}
      </ThemedView>
      <Pressable
        onPress={() => router.push('/pricing')}
        style={[styles.planButton, { backgroundColor: colors.accent }]}
      >
        <ThemedText style={styles.planButtonText}>
          {current.plan === 'free' ? 'Tarifni oshirish' : expiresSoon ? 'Yangilash' : "Tariflar"}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function JobCard({ job, onDelete }: { job: Job; onDelete: (id: string) => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const thumbnail = job.video_thumbnail || `https://img.youtube.com/vi/${job.job_id}/mqdefault.jpg`;

  const confirmDelete = () => {
    Alert.alert("Videoni o'chirish", `"${job.video_title || 'Video'}" o'chirilsinmi?`, [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => onDelete(job.job_id) },
    ]);
  };

  return (
    <Pressable
      onPress={() => router.push(`/video/${job.job_id}`)}
      style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Image source={{ uri: thumbnail }} style={styles.thumbnail} contentFit="cover" />
      <ThemedView style={styles.jobInfo}>
        <ThemedText numberOfLines={2} style={styles.jobTitle}>
          {job.video_title || 'Video'}
        </ThemedText>
        <ThemedView style={styles.jobMetaRow}>
          <ThemedView style={styles.statusBadge}>
            <ThemedView style={[styles.statusDot, { backgroundColor: statusColor(job.status, colors) }]} />
            <ThemedText variant="secondary" style={styles.statusText}>
              {JOB_STATUS_LABELS[job.status] || job.status}
            </ThemedText>
          </ThemedView>
          {job.video_duration ? (
            <ThemedText variant="secondary" style={styles.statusText}>
              {formatDuration(job.video_duration)}
            </ThemedText>
          ) : null}
        </ThemedView>
      </ThemedView>
      <Pressable onPress={confirmDelete} hitSlop={10} style={styles.deleteButton}>
        <ThemedText style={{ color: colors.danger, fontWeight: '700' }}>O&apos;chirish</ThemedText>
      </Pressable>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: jobs, isLoading, refetch, isRefetching } = useJobs();

  const handleDelete = async (jobId: string) => {
    try {
      await jobsApi.deleteJob(jobId);
      queryClient.setQueryData<Job[]>(['jobs'], (prev) => (prev || []).filter((j) => j.job_id !== jobId));
    } catch {
      Alert.alert('Xatolik', "Videoni o'chirishda xatolik yuz berdi.");
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.headerAction, { color: colors.accent }]}>{'< Orqaga'}</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Mening videolarim</ThemedText>
          <ThemedView style={{ width: 60, backgroundColor: 'transparent' }} />
        </ThemedView>

        <FlatList
          data={jobs || []}
          keyExtractor={(job) => job.job_id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListHeaderComponent={<PlanCard />}
          renderItem={({ item }) => <JobCard job={item} onDelete={handleDelete} />}
          ListEmptyComponent={
            !isLoading ? (
              <ThemedView style={styles.empty}>
                <ThemedText variant="secondary">Hali dublyaj qilingan video yo&apos;q.</ThemedText>
              </ThemedView>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerAction: { fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  planLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planName: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  planMeta: { fontSize: 12, marginTop: 2 },
  planButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  planButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    gap: 12,
  },
  thumbnail: { width: 72, height: 48, borderRadius: 10, backgroundColor: '#00000010' },
  jobInfo: { flex: 1, gap: 6, backgroundColor: 'transparent' },
  jobTitle: { fontSize: 13, fontWeight: '700' },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'transparent' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  deleteButton: { paddingHorizontal: 6, paddingVertical: 4 },
  empty: { alignItems: 'center', paddingVertical: 60 },
});
