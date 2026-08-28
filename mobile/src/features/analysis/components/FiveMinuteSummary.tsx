import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { ThemedView } from '../../../components/ThemedView';
import { useTheme } from '../../../theme/ThemeProvider';
import type { FiveMinuteSummary as FiveMinuteSummaryType } from '../types';

// "5 daqiqada" tabi -- mirrors frontend/components/analysis/FiveMinuteTab.tsx
// content structure exactly, RN primitives instead of DOM/lucide.

interface FiveMinuteSummaryProps {
  summary: FiveMinuteSummaryType | null | undefined;
  loading: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <ThemedView style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: colors.accent }]}>{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

export function FiveMinuteSummary({ summary, loading }: FiveMinuteSummaryProps) {
  const { colors } = useTheme();

  if (loading || !summary) {
    return (
      <ThemedView style={styles.empty}>
        {loading && <ActivityIndicator color={colors.accent} style={{ marginBottom: 10 }} />}
        <ThemedText variant="secondary" style={styles.emptyText}>
          {loading ? "5 daqiqalik xulosa tayyorlanmoqda..." : "5 daqiqalik xulosa hali tayyor emas."}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {summary.title ? <ThemedText style={styles.title}>{summary.title}</ThemedText> : null}

      {summary.why_it_matters ? (
        <Section title="Nima uchun muhim">
          <ThemedText style={styles.bodyText}>{summary.why_it_matters}</ThemedText>
        </Section>
      ) : null}

      {summary.core_ideas?.length > 0 && (
        <Section title="Asosiy g'oyalar">
          <ThemedView style={{ gap: 6 }}>
            {summary.core_ideas.map((idea, i) => (
              <ThemedView key={i} style={styles.listRow}>
                <ThemedText style={[styles.listMarker, { color: colors.accent }]}>{i + 1}.</ThemedText>
                <ThemedText style={[styles.bodyText, { flex: 1 }]}>{idea}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        </Section>
      )}

      {summary.examples?.length > 0 && (
        <Section title="Misollar">
          <ThemedView style={{ gap: 8 }}>
            {summary.examples.map((ex, i) => (
              <ThemedView
                key={i}
                style={[styles.exampleCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <ThemedText style={styles.bodyText}>{ex}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        </Section>
      )}

      {summary.takeaways?.length > 0 && (
        <Section title="Amaliy xulosalar">
          <ThemedView style={{ gap: 6 }}>
            {summary.takeaways.map((tk, i) => (
              <ThemedView key={i} style={styles.listRow}>
                <ThemedText style={[styles.listMarker, { color: colors.success }]}>✓</ThemedText>
                <ThemedText style={[styles.bodyText, { flex: 1 }]}>{tk}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        </Section>
      )}

      {summary.key_terms?.length > 0 && (
        <Section title="Muhim terminlar">
          <ThemedView style={{ gap: 8 }}>
            {summary.key_terms.map((kt, i) => (
              <ThemedView
                key={i}
                style={[styles.termCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <ThemedText style={styles.termTitle}>{kt.term}</ThemedText>
                <ThemedText variant="secondary" style={styles.termExplanation}>
                  {kt.explanation}
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        </Section>
      )}

      {summary.remember ? (
        <ThemedView style={[styles.rememberBox, { backgroundColor: colors.accentGlow, borderColor: colors.accent }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.accent, marginBottom: 4 }]}>
            Eslab qoling
          </ThemedText>
          <ThemedText style={styles.rememberText}>{summary.remember}</ThemedText>
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  bodyText: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  listRow: { flexDirection: 'row', gap: 8 },
  listMarker: { fontWeight: '800', fontSize: 14 },
  exampleCard: { borderWidth: 1, borderRadius: 12, padding: 10 },
  termCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  termTitle: { fontSize: 14, fontWeight: '800' },
  termExplanation: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  rememberBox: { borderWidth: 1, borderRadius: 14, padding: 16 },
  rememberText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
