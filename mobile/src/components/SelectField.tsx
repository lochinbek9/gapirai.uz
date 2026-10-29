import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

/** Saytdagi <select class="ui-input"> -- Android'da pastdan chiqadigan ro'yxat. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        style={[styles.field, { borderColor: colors.rule, backgroundColor: colors.surface }]}
      >
        <ThemedText style={styles.value}>{current?.label}</ThemedText>
        <ChevronDown size={18} color={colors.muted} strokeWidth={2} />
      </Pressable>
      {hint ? (
        <ThemedText variant="secondary" style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Yopish" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.rule, paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <ThemedText style={styles.sheetTitle}>{label}</ThemedText>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.ground }]}
              >
                <ThemedText style={[styles.optionLabel, active && { fontWeight: '500' }]}>{o.label}</ThemedText>
                {active && <Check size={18} color={colors.accentInk} strokeWidth={2} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 16 },
  hint: { fontSize: 14, lineHeight: 20 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', paddingHorizontal: 12, paddingBottom: 8 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: radius.tab,
  },
  optionLabel: { fontSize: 15 },
});
