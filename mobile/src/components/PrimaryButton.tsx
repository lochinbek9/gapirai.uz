import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ThemedText } from './ThemedText';
import type { IconComponent } from './BrandIcons';

interface PrimaryButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Saytdagi .ui-btn-primary (siyoh), .ui-btn-secondary (oq + chiziq), .ui-btn-accent (ko'k) */
  variant?: 'primary' | 'secondary' | 'accent';
  /** sm = 36 (header), md = 44 (odatiy), lg = 48 (forma yuborish) */
  size?: 'sm' | 'md' | 'lg';
  icon?: IconComponent;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const HEIGHT = { sm: 36, md: 44, lg: 48 } as const;

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  fullWidth = true,
  style,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  // O'chirilgan holat saytdagidek: kulrang fon, muted matn, ingichka chiziq
  const bg = isDisabled
    ? colors.ground
    : variant === 'primary'
      ? colors.dark
      : variant === 'accent'
        ? colors.accent
        : colors.surface;
  const fg = isDisabled ? colors.muted : variant === 'primary' ? colors.darkInk : variant === 'accent' ? '#FFFFFF' : colors.ink;
  const ringed = isDisabled || variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 14 : 18,
          backgroundColor: pressed && variant === 'secondary' && !isDisabled ? colors.ground : bg,
          borderColor: ringed ? colors.rule : bg,
          opacity: pressed && variant !== 'secondary' ? 0.88 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        fullWidth && styles.full,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        Icon && <Icon size={size === 'sm' ? 16 : 18} color={fg} strokeWidth={2} />
      )}
      <ThemedText style={[styles.label, { color: fg, fontSize: size === 'sm' ? 14 : 15 }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  full: { alignSelf: 'stretch' },
  label: { fontWeight: '500' },
});
