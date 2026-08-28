import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useTheme } from '../../src/theme/ThemeProvider';

// Bottom tab shell — Home / Library / Profile only, per the user's own
// design brief (2026-08-22): "5 ta navigation item qo'ymasdim... Home |
// Library | Profile yetarli." Emoji tab icons match that same brief's own
// mockup glyphs (🏠🎬👤) rather than pulling in an icon library — none is
// installed anywhere else in this app.
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bosh sahifa',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Kutubxona',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎬</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
