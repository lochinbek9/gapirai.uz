import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import type { IconComponent } from './BrandIcons';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconComponent;
}

/** Panel ichidagi ikkinchi darajali tanlov (Havola / Fayl) -- segmentlar ichma-ich bo'lmasin. */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.row, { borderBottomColor: colors.rule }]}>
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        const fg = active ? colors.ink : colors.muted;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 8, bottom: 0, left: 6, right: 6 }}
            style={[styles.tab, { borderBottomColor: active ? colors.ink : 'transparent' }]}
          >
            {Icon && <Icon size={14} color={fg} strokeWidth={2} />}
            <ThemedText style={[styles.label, { color: fg }]}>{label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 20, borderBottomWidth: 1 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
    paddingBottom: 10,
    marginBottom: -1,
    borderBottomWidth: 2,
  },
  label: { fontSize: 14, fontWeight: '500' },
});
