import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste } from 'lucide-react-native';
import { Pressable, StyleSheet, type TextInputProps } from 'react-native';

import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { Youtube } from './BrandIcons';
import { ThemedText } from './ThemedText';
import { ThemedTextInput } from './ThemedTextInput';

/** Saytdagi YouTube havola maydoni: chapda YouTube belgisi, o'ngda "Qo'yish" (buferdan). */
export function UrlField({
  label = 'YouTube havolasi',
  hideLabel,
  value,
  onChangeText,
  onBlur,
  error,
  hint,
  placeholder = 'youtube.com/watch?v=...',
  onSubmitEditing,
}: {
  label?: string;
  hideLabel?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: TextInputProps['onBlur'];
  error?: string;
  hint?: string;
  placeholder?: string;
  onSubmitEditing?: () => void;
}) {
  const { colors } = useTheme();
  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (text) onChangeText(text);
  };
  return (
    <ThemedTextInput
      label={label}
      hideLabel={hideLabel}
      icon={Youtube}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      error={error}
      hint={hint}
      placeholder={placeholder}
      keyboardType="url"
      returnKeyType="go"
      onSubmitEditing={onSubmitEditing}
      accessory={
        <Pressable
          onPress={paste}
          accessibilityRole="button"
          accessibilityLabel="Havolani buferdan qoʻyish"
          style={({ pressed }) => [styles.paste, pressed && { backgroundColor: colors.ground }]}
        >
          <ClipboardPaste size={16} color={colors.muted} strokeWidth={2} />
          <ThemedText variant="secondary" style={styles.pasteLabel}>
            Qoʻyish
          </ThemedText>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  paste: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.tab },
  pasteLabel: { fontSize: 14, fontWeight: '500' },
});
