import { StyleSheet } from 'react-native';

import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';

interface AuthLinkProps {
  label: string;
  actionLabel: string;
  onPress: () => void;
}

// RN's <Text> only accepts other <Text> as children (not Pressable/View), so
// the tappable word is a nested <Text onPress> rather than a wrapped Pressable.
export function AuthLink({ label, actionLabel, onPress }: AuthLinkProps) {
  const { colors } = useTheme();
  return (
    <ThemedText variant="secondary" style={styles.row}>
      {label}{' '}
      <ThemedText onPress={onPress} suppressHighlighting style={[styles.action, { color: colors.accent }]}>
        {actionLabel}
      </ThemedText>
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  row: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
  },
});
