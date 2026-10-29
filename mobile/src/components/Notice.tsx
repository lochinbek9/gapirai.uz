import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { alpha, radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import type { IconComponent } from './BrandIcons';

/** Xato / ogohlantirish qutisi: saytdagi `border-ui-red/30 bg-ui-red/[0.05]` va hk. */
export function Notice({
  tone = 'error',
  title,
  children,
  icon: Icon,
}: {
  tone?: 'error' | 'warning' | 'success' | 'neutral';
  title?: string;
  children?: ReactNode;
  icon?: IconComponent;
}) {
  const { colors, mode } = useTheme();
  const amber = mode === 'dark' ? '#FCD34D' : '#B45309';
  const base = tone === 'error' ? colors.red : tone === 'warning' ? '#F59E0B' : tone === 'success' ? colors.green : colors.muted;
  const ink = tone === 'error' ? colors.redInk : tone === 'warning' ? amber : tone === 'success' ? colors.greenInk : colors.ink;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.box, { borderColor: alpha(base, 0.3), backgroundColor: tone === 'neutral' ? colors.ground : alpha(base, 0.06) }]}
    >
      {Icon && <Icon size={18} color={ink} strokeWidth={2} style={styles.icon} />}
      <View style={styles.body}>
        {title ? <ThemedText style={[styles.title, { color: tone === 'neutral' ? colors.ink : ink }]}>{title}</ThemedText> : null}
        {typeof children === 'string' ? (
          <ThemedText style={[styles.text, title ? { color: colors.muted } : { color: ink, fontWeight: '500' }]}>{children}</ThemedText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  text: { fontSize: 15, lineHeight: 22 },
});
