import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';

interface ThemedTextInputProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

export function ThemedTextInput({ label, error, isPassword, secureTextEntry, style, ...rest }: ThemedTextInputProps) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!isPassword);

  return (
    <View style={styles.wrapper}>
      <ThemedText variant="secondary" style={styles.label}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputRow,
          { borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.textPrimary }, style]}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={isPassword ? hidden : secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
        />
        {isPassword && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <ThemedText variant="secondary" style={styles.toggle}>
              {hidden ? "Ko'rsatish" : 'Yashirish'}
            </ThemedText>
          </Pressable>
        )}
      </View>
      {error && (
        <ThemedText style={[styles.error, { color: colors.danger }]}>{error}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 14,
  },
  toggle: {
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
  },
});
