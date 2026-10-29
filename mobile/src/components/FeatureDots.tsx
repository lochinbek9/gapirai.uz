import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

/** Forma ostidagi "nima olasiz" qatori: kichik nuqta + yorliq (sayt: SRT · VTT · ...). */
export function FeatureDots({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {items.map((label) => (
        <View key={label} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: colors.muted }]} />
          <ThemedText style={styles.label}>{label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 8, paddingTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 14, fontWeight: '500' },
});
