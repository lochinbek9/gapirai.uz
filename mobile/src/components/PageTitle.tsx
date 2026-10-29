import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './ThemedText';

/** Saytdagi PageTitle: H1 (36, 600, -0.035em) + qisqa izoh (18, muted). */
export function PageTitle({ title, lead, center, children }: { title: string; lead?: string; center?: boolean; children?: ReactNode }) {
  return (
    <View style={center && styles.center}>
      <ThemedText accessibilityRole="header" style={[styles.title, center && styles.textCenter]}>
        {title}
      </ThemedText>
      {lead ? (
        <ThemedText variant="secondary" style={[styles.lead, center && styles.textCenter]}>
          {lead}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

/** Bo'lim sarlavhasi (sayt: text-3xl 600 -0.03em) */
export function SectionTitle({ children, lead }: { children: string; lead?: string }) {
  return (
    <View>
      <ThemedText accessibilityRole="header" style={styles.section}>
        {children}
      </ThemedText>
      {lead ? (
        <ThemedText variant="secondary" style={styles.sectionLead}>
          {lead}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  title: { fontSize: 36, lineHeight: 39, fontWeight: '600', letterSpacing: -1.26 },
  lead: { fontSize: 18, lineHeight: 29, marginTop: 16, maxWidth: 560 },
  section: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9 },
  sectionLead: { fontSize: 18, lineHeight: 28, marginTop: 12 },
});
