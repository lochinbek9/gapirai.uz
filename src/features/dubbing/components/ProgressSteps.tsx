import { StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import { JOB_STATUS_LABELS, type JobStatus } from '../types';

// Real pipeline order from backend/workers/tasks.py — 'pending' (queued,
// nothing started) and 'completed'/'failed' (terminal) are handled by the
// caller, not listed as steps here.
const STEPS: JobStatus[] = ['downloading', 'transcribing', 'translating', 'synthesizing', 'syncing', 'merging'];

interface ProgressStepsProps {
  status: JobStatus;
}

export function ProgressSteps({ status }: ProgressStepsProps) {
  const { colors } = useTheme();
  const currentIndex = STEPS.indexOf(status);

  return (
    <ThemedView style={styles.list}>
      {STEPS.map((step, index) => {
        const isDone = currentIndex > index;
        const isCurrent = currentIndex === index;
        const icon = isDone ? '✓' : isCurrent ? '◉' : '○';
        const iconColor = isDone ? colors.success : isCurrent ? colors.accent : colors.textSecondary;
        return (
          <ThemedView key={step} style={styles.row}>
            <ThemedText style={[styles.icon, { color: iconColor }]}>{icon}</ThemedText>
            <ThemedText
              variant={isDone || isCurrent ? undefined : 'secondary'}
              style={[styles.label, isCurrent && { fontWeight: '800' }]}
            >
              {JOB_STATUS_LABELS[step]}
            </ThemedText>
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 15, fontWeight: '800', width: 18, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
