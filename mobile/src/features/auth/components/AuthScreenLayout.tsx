import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../../../components/Card';
import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';

const LOGO_LIGHT = require('../../../../assets/logo.png');
const LOGO_DARK = require('../../../../assets/logo-dark.png');

interface AuthScreenLayoutProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  /** Karta ichida, formadan keyin: "Hisobingiz yo'qmi? Ro'yxatdan o'ting" */
  footer?: ReactNode;
  /** Yuqori o'ngdagi havola (sayt: "← Bosh sahifa"; parol tiklashda "← Kirish") */
  backTo?: { label: string; onPress: () => void };
}

/** Saytdagi auth sahifalari: ground fon, minimal yuqori qator, markazda sarlavha va 400px karta. */
export function AuthScreenLayout({ title, subtitle, footer, backTo, children }: AuthScreenLayoutProps) {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const back = backTo ?? { label: 'Bosh sahifa', onPress: () => router.navigate('/') };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: colors.ground }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="GapirAI.uz — bosh sahifa">
          <Image source={mode === 'dark' ? LOGO_DARK : LOGO_LIGHT} style={styles.logo} contentFit="contain" />
        </Pressable>
        <Pressable onPress={back.onPress} accessibilityRole="link" hitSlop={10} style={styles.backLink}>
          {({ pressed }) => (
            <>
              <ArrowLeft size={16} color={pressed ? colors.ink : colors.muted} strokeWidth={2} />
              <ThemedText style={[styles.backText, { color: pressed ? colors.ink : colors.muted }]}>{back.label}</ThemedText>
            </>
          )}
        </Pressable>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <ThemedText accessibilityRole="header" style={styles.title}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="secondary" style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}
            <Card style={styles.card}>
              <View style={styles.form}>{children}</View>
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Ijtimoiy kirish tugmalari va forma orasidagi "yoki" chizig'i */
export function OrDivider() {
  const { colors } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.rule }]} />
      <ThemedText variant="secondary" style={styles.dividerText}>
        yoki
      </ThemedText>
      <View style={[styles.line, { backgroundColor: colors.rule }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  logo: { width: 45, height: 32 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 64 },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  card: { marginTop: 32, padding: 24 },
  form: { gap: 20 },
  footer: { marginTop: 24 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },
});
