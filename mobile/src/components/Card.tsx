import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';

/** .ui-card: oq yuza, ingichka chiziq, 16 radius. `raised` -- bosh sahifa formasi kabi yengil soya. */
export function Card({ style, raised, ...rest }: ViewProps & { raised?: boolean }) {
  const { colors, mode } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.rule },
        raised && mode === 'light' && styles.raised,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  raised: {
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
});
