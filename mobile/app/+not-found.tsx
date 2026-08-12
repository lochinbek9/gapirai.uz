import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>This screen does not exist.</ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText>Go to home screen</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  link: { paddingVertical: 12 },
});
