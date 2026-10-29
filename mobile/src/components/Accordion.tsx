import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

/** Saytdagi <details> ro'yxati: savol + "+" (ochilganda 45° buriladi), ingichka chiziqlar orasida. */
export function Accordion({ items, style }: { items: { q: string; a: string }[]; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={[styles.accordion, { borderColor: colors.rule }, style]}>
      {items.map(({ q, a }, i) => {
        const isOpen = open === q;
        return (
          <View key={q} style={[styles.faqItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.rule }]}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : q)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={styles.faqHead}
            >
              <ThemedText style={styles.question}>{q}</ThemedText>
              <Plus size={16} color={colors.muted} strokeWidth={2} style={{ transform: [{ rotate: isOpen ? '45deg' : '0deg' }] }} />
            </Pressable>
            {isOpen && (
              <ThemedText variant="secondary" style={styles.answer}>
                {a}
              </ThemedText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  accordion: { borderTopWidth: 1, borderBottomWidth: 1 },
  faqItem: { paddingVertical: 16 },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 28 },
  question: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '500' },
  answer: { fontSize: 15, lineHeight: 24, marginTop: 8 },
});
