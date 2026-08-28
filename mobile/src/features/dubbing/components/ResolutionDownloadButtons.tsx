import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import * as dubbingApi from '../api';
import type { ResolutionOption } from '../types';

// Mirrors frontend/components/ResolutionDownloadButtons.tsx — same polling
// pattern (request, then poll GET until ready/failed), same "expired" state
// (master file's S3 lifecycle already deleted it, added 2026-08-22). No
// download-icon library here (mobile has none installed anywhere else in the
// app) — status is conveyed with plain text, matching the app's existing
// text-only button style.
const POLL_INTERVAL_MS = 4000;

interface ResolutionDownloadButtonsProps {
  jobId: string;
}

export function ResolutionDownloadButtons({ jobId }: ResolutionDownloadButtonsProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [resolutions, setResolutions] = useState<ResolutionOption[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const refresh = async () => {
    try {
      const res = await dubbingApi.getJobResolutions(jobId);
      setResolutions(res.resolutions);
      return res.resolutions;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    refresh();
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const startPolling = (resolution: string) => {
    if (pollTimers.current[resolution]) return;
    pollTimers.current[resolution] = setInterval(async () => {
      const updated = await refresh();
      const opt = updated?.find((r) => r.resolution === resolution);
      if (opt && (opt.status === 'ready' || opt.status === 'failed')) {
        clearInterval(pollTimers.current[resolution]);
        delete pollTimers.current[resolution];
        setBusy((b) => ({ ...b, [resolution]: false }));
      }
    }, POLL_INTERVAL_MS);
  };

  const handlePress = async (opt: ResolutionOption) => {
    if (!opt.available) {
      router.push('/pricing');
      return;
    }
    setBusy((b) => ({ ...b, [opt.resolution]: true }));
    try {
      const res = await dubbingApi.requestResolution(jobId, opt.resolution);
      if (res.status === 'ready' && res.download_url) {
        await Linking.openURL(res.download_url);
        setBusy((b) => ({ ...b, [opt.resolution]: false }));
        refresh();
      } else {
        startPolling(opt.resolution);
        refresh();
      }
    } catch {
      // e.g. 410 (storage muddati tugagan) -- qayta GET chaqirilsa backend
      // haqiqiy "expired" holatini qaytaradi, tugma shunga qarab yangilanadi.
      setBusy((b) => ({ ...b, [opt.resolution]: false }));
      refresh();
    }
  };

  if (!resolutions) {
    return (
      <ThemedView style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <ThemedText variant="secondary" style={styles.loadingText}>
          Sifat variantlari yuklanmoqda...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.row}>
      {resolutions.map((opt) => {
        const isBusy = busy[opt.resolution] || opt.status === 'processing';
        const isFailed = opt.status === 'failed';
        const isExpired = opt.status === 'expired';

        if (!opt.available) {
          return (
            <Pressable
              key={opt.resolution}
              onPress={() => router.push('/pricing')}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <ThemedText variant="secondary" style={styles.chipLabel}>
                🔒 {opt.resolution}
              </ThemedText>
            </Pressable>
          );
        }

        if (isExpired) {
          return (
            <ThemedView
              key={opt.resolution}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface, opacity: 0.6 }]}
            >
              <ThemedText variant="secondary" style={styles.chipLabel}>
                {opt.resolution} — muddati tugagan
              </ThemedText>
            </ThemedView>
          );
        }

        return (
          <Pressable
            key={opt.resolution}
            disabled={isBusy}
            onPress={() => handlePress(opt)}
            style={[styles.chip, styles.chipActive, { backgroundColor: colors.accent, opacity: isBusy ? 0.7 : 1 }]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.chipActiveLabel}>
                {opt.resolution}
                {isFailed ? ' — qayta urinish' : ''}
              </ThemedText>
            )}
            {isBusy && <ThemedText style={styles.chipActiveLabel}>tayyorlanmoqda...</ThemedText>}
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipLabel: { fontSize: 13, fontWeight: '700' },
  chipActive: { borderWidth: 0 },
  chipActiveLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
