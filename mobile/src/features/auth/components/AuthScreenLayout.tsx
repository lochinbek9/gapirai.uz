import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../../components/ThemedText';
import { useTheme } from '../../../theme/ThemeProvider';

const LOGO_LIGHT = require('../../../../assets/logo.png');
const LOGO_DARK = require('../../../../assets/logo-dark.png');

interface AuthScreenLayoutProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  /** Karta ichida, formadan keyin: "Hisobingiz yo'qmi? Ro'yxatdan o'ting" */
  footer?: ReactNode;
  /** Yuqori chapdagi "orqaga" tugmasi (odatda bosh sahifaga; parol tiklashda kirishga) */
  backTo?: { label: string; onPress: () => void };
}

/** Ilova auth ekrani: oq fon, chapda "orqaga" strelkasi, logotip + sarlavha, kartasiz forma
 *  (saytdagi ground fon + markazdagi karta telefonda veb-sahifadek ko'rinardi -- egasi 2026-11-01). */
export function AuthScreenLayout({ title, subtitle, footer, backTo, children }: AuthScreenLayoutProps) {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const back = backTo ?? { label: 'Bosh sahifa', onPress: () => router.navigate('/') };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: colors.surface }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={back.onPress}
          accessibilityRole="button"
          accessibilityLabel={back.label}
          hitSlop={6}
          style={({ pressed }) => [styles.backButton, pressed && { backgroundColor: colors.ground }]}
        >
          <ArrowLeft size={22} color={colors.ink} strokeWidth={2} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <Image source={mode === 'dark' ? LOGO_DARK : LOGO_LIGHT} style={styles.logo} contentFit="contain" />
            <ThemedText accessibilityRole="header" style={styles.title}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="secondary" style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}
            <View style={[styles.form, styles.body]}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 45, height: 32 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7, marginTop: 24 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  body: { marginTop: 32 },
  form: { gap: 20 },
  footer: { marginTop: 28 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
});
