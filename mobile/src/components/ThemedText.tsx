import { Text, type TextProps } from 'react-native';

import { withFont } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';

interface ThemedTextProps extends TextProps {
  variant?: 'primary' | 'secondary';
}

/** Barcha matn Geist bilan (fontWeight -> Geist oilasi), rang -- ink yoki muted. */
export function ThemedText({ style, variant = 'primary', ...rest }: ThemedTextProps) {
  const { colors } = useTheme();
  const color = variant === 'secondary' ? colors.muted : colors.ink;
  return <Text style={withFont([{ color, fontSize: 15 }, style])} {...rest} />;
}
