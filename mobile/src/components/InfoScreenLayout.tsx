import type { ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import type { LegalDoc, Run } from '../content/legal';
import { useTheme } from '../theme/ThemeProvider';
import { Footer } from './Footer';
import { PageTitle } from './PageTitle';
import { Screen } from './Screen';
import { ThemedText } from './ThemedText';

/** Saytdagi PageShell + PageTitle: matnli ichki sahifalar (shartlar, maxfiylik, savollar). */
export function InfoScreenLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Screen>
      <View style={styles.page}>
        <PageTitle title={title} lead={subtitle} />
        {children}
      </View>
      <Footer />
    </Screen>
  );
}

/** .ui-prose bo'limi: H2 (18/600) + muted matn (15, 1.7) */
export function InfoSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={styles.h2}>
        {heading}
      </ThemedText>
      {children}
    </View>
  );
}

function Runs({ runs }: { runs: Run[] }) {
  const { colors } = useTheme();
  return (
    <ThemedText variant="secondary" style={styles.p}>
      {runs.map((r, i) =>
        r.href ? (
          <ThemedText
            key={i}
            style={[styles.p, { color: colors.accentInk, textDecorationLine: 'underline' }]}
            onPress={() => Linking.openURL(r.href!.startsWith('/') ? `https://gapirai.uz${r.href}` : r.href!).catch(() => {})}
            suppressHighlighting
          >
            {r.t}
          </ThemedText>
        ) : r.b ? (
          <ThemedText key={i} style={[styles.p, { fontWeight: '500' }]}>
            {r.t}
          </ThemedText>
        ) : (
          r.t
        ),
      )}
    </ThemedText>
  );
}

/** Sayt sahifasidan avtomatik ko'chirilgan huquqiy matn (src/content/legal.ts) */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.prose, { borderTopColor: colors.rule }]}>
      {doc.sections.map((s) => (
        <InfoSection key={s.heading} heading={s.heading}>
          {s.blocks.map((b, i) =>
            'p' in b ? (
              <Runs key={i} runs={b.p} />
            ) : (
              <View key={i} style={styles.list}>
                {b.list.map((li, j) => (
                  <View key={j} style={styles.li}>
                    <ThemedText variant="secondary" style={styles.p}>
                      •
                    </ThemedText>
                    <View style={styles.flex}>
                      <Runs runs={li} />
                    </View>
                  </View>
                ))}
              </View>
            ),
          )}
        </InfoSection>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 96 },
  prose: { marginTop: 48, borderTopWidth: 1, paddingTop: 40, gap: 32 },
  section: { gap: 10 },
  h2: { fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.18 },
  p: { fontSize: 15, lineHeight: 25.5 },
  list: { gap: 6 },
  li: { flexDirection: 'row', gap: 10 },
});
