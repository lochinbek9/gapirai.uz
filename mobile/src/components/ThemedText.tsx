import { Text, type TextProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface ThemedTextProps extends TextProps {
  variant?: 'primary' | 'secondary';
}

export function ThemedText({ style, variant = 'primary', ...rest }: ThemedTextProps) {
  const { colors } = useTheme();
  const color = variant === 'secondary' ? colors.textSecondary : colors.textPrimary;
  return <Text style={[{ color }, style]} {...rest} />;
}
