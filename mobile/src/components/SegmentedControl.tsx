import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  scrollable?: boolean;
}

export function SegmentedControl<T extends string>({ options, value, onChange, scrollable }: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  const content = (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segment,
              scrollable && styles.segmentScrollable,
              active && { backgroundColor: colors.accent },
            ]}
          >
            <ThemedText
              style={[styles.label, active ? styles.labelActive : { color: colors.textSecondary }]}
            >
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {content}
      </ScrollView>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentScrollable: {
    flex: 0,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  labelActive: {
    color: '#ffffff',
  },
});
