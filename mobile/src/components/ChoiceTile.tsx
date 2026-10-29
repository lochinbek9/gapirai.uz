import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

/** Tanlanadigan plitka (ovoz, video tili): tanlangani -- aksent chegara + 1px halqa + 6% fon. */
export function ChoiceTile({
  title,
  description,
  selected,
  onPress,
  style,
  children,
  radio = true,
}: {
  title?: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  radio?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityState={radio ? { checked: selected } : { selected }}
      style={({ pressed }) => [
        styles.tile,
        selected
          ? { borderColor: colors.accent, borderWidth: 2, padding: 11, backgroundColor: alpha(colors.accent, 0.06) }
          : { borderColor: pressed ? colors.muted : colors.rule },
        style,
      ]}
    >
      {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
      {description ? (
        <ThemedText variant="secondary" style={styles.desc}>
          {description}
        </ThemedText>
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: 60, justifyContent: 'center', borderWidth: 1, borderRadius: radius.control, padding: 12 },
  title: { fontSize: 15, fontWeight: '500', lineHeight: 18 },
  desc: { fontSize: 13, lineHeight: 16, marginTop: 4 },
});
