import { StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';

interface AuthLinkProps {
  label: string;
  actionLabel: string;
  onPress: () => void;
}

// RN'da <Text> ichida faqat <Text> bo'la oladi -- bosiladigan so'z ichma-ich <Text onPress>.
export function AuthLink({ label, actionLabel, onPress }: AuthLinkProps) {
  const { colors } = useTheme();
  return (
    <ThemedText variant="secondary" style={styles.row}>
      {label}{' '}
      <ThemedText onPress={onPress} suppressHighlighting accessibilityRole="link" style={[styles.row, styles.action, { color: colors.accentInk }]}>
        {actionLabel}
      </ThemedText>
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  row: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  action: { fontWeight: '500' },
});
