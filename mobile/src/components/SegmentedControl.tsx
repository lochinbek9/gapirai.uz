import { Pressable, StyleSheet, View } from 'react-native';

import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import type { IconComponent } from './BrandIcons';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconComponent;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Saytdagi xizmat tablari: ground iz (4px ichki bo'shliq), tanlangani oq + ingichka halqa. */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View accessibilityRole="tablist" style={[styles.row, { backgroundColor: colors.ground }]}>
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        const fg = active ? colors.ink : colors.muted;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              active && [styles.active, { backgroundColor: colors.surface, borderColor: colors.rule }],
            ]}
          >
            {Icon && <Icon size={16} color={fg} strokeWidth={2} />}
            <ThemedText numberOfLines={1} style={[styles.label, { color: fg }]}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radius.control, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    borderRadius: radius.tab,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  active: {
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  label: { fontSize: 14, fontWeight: '500' },
});
