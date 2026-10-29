import { View, type ViewProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function ThemedView({ style, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.surface }, style]} {...rest} />;
}
