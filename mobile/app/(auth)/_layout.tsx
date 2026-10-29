import { Stack } from 'expo-router';

import { useTheme } from '../../src/theme/ThemeProvider';

// Auth sahifalari o'z yuqori qatoriga ega (AuthScreenLayout) -- saytdagidek minimal.
export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />;
}
