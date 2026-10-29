import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { ThemedText } from '../src/components/ThemedText';
import { useTheme } from '../src/theme/ThemeProvider';

// frontend/app/not-found.tsx bilan bir xil
export default function NotFoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.wrap}>
        <ThemedText style={[styles.code, { color: colors.accentInk }]}>404</ThemedText>
        <ThemedText accessibilityRole="header" style={styles.title}>
          Bunday sahifa mavjud emas
        </ThemedText>
        <ThemedText variant="secondary" style={styles.text}>
          Siz qidirayotgan sahifa oʻchirilgan, nomi oʻzgargan yoki manzili notoʻgʻri kiritilgan boʻlishi mumkin.
        </ThemedText>
        <View style={styles.actions}>
          <PrimaryButton label="Bosh sahifa" onPress={() => router.replace('/')} />
          {router.canGoBack() && <PrimaryButton label="Ortga qaytish" icon={ArrowLeft} variant="secondary" onPress={() => router.back()} />}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 96, alignItems: 'center' },
  code: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  title: { fontSize: 36, lineHeight: 40, fontWeight: '600', letterSpacing: -1.08, textAlign: 'center', marginTop: 12 },
  text: { fontSize: 18, lineHeight: 29, textAlign: 'center', marginTop: 16 },
  actions: { alignSelf: 'stretch', gap: 12, marginTop: 32 },
});
