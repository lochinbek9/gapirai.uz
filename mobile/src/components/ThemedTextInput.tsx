import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { alpha, radius } from '../theme/colors';
import { withFont } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import type { IconComponent } from './BrandIcons';

interface ThemedTextInputProps extends TextInputProps {
  /** Ko'rinadigan yorliq (.ui-label). Bo'sh bo'lsa faqat accessibilityLabel sifatida ishlatiladi. */
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  isPassword?: boolean;
  icon?: IconComponent;
  /** Maydon ichidagi o'ng tomondagi element (masalan "Qo'yish" tugmasi) */
  accessory?: ReactNode;
  /** Yorliq qatorining o'ng tomoni (masalan "Parolni unutdingizmi?") */
  labelAccessory?: ReactNode;
}

/** .ui-input: 48px, 1px chiziq, 10 radius; fokusda aksent chegara + 3px och halqa. */
export const ThemedTextInput = forwardRef<TextInput, ThemedTextInputProps>(function ThemedTextInput(
  { label, hideLabel, error, hint, isPassword, icon: Icon, accessory, labelAccessory, secureTextEntry, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!isPassword);
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.red : focused ? colors.accent : colors.rule;

  return (
    <View style={styles.wrapper}>
      {!hideLabel && (
        <View style={styles.labelRow}>
          <ThemedText style={styles.label}>{label}</ThemedText>
          {labelAccessory}
        </View>
      )}
      <View style={[styles.ring, { backgroundColor: focused ? alpha(error ? colors.red : colors.accent, 0.15) : 'transparent' }]}>
        <View style={[styles.inputRow, { borderColor, backgroundColor: colors.surface, paddingRight: accessory ? 6 : 14 }]}>
          {Icon && <Icon size={20} color={colors.muted} strokeWidth={2} />}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            style={[withFont({ fontSize: 16 }), styles.input, { color: colors.ink }, style]}
            placeholderTextColor={colors.muted}
            selectionColor={alpha(colors.accent, 0.35)}
            cursorColor={colors.accent}
            secureTextEntry={isPassword ? hidden : secureTextEntry}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...rest}
          />
          {isPassword && (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Parolni koʻrsatish' : 'Parolni yashirish'}
              style={styles.eye}
            >
              {hidden ? <Eye size={16} color={colors.muted} strokeWidth={2} /> : <EyeOff size={16} color={colors.muted} strokeWidth={2} />}
            </Pressable>
          )}
          {accessory}
        </View>
      </View>
      {error ? (
        <ThemedText style={[styles.small, { color: colors.redInk }]}>{error}</ThemedText>
      ) : hint ? (
        <ThemedText variant="secondary" style={styles.small}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  // 3px fokus halqasi: tashqi qatlam maket o'lchamini o'zgartirmaydi
  ring: { margin: -3, padding: 3, borderRadius: radius.control + 3 },
  inputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingLeft: 12,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eye: { padding: 4 },
  small: { fontSize: 14, lineHeight: 20 },
});
