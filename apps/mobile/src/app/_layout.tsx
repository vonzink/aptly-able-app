import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '../bootstrap/AppProviders';
import { fontFamily, useTheme } from '../ui/theme';
import { RecordingActivityBanner } from '../features/plaud-device/RecordingActivityBanner';

function Navigation() {
  const { colors, dark } = useTheme();
  const icons = {
    index: 'home-outline',
    recordings: 'list-outline',
    recorder: 'radio-outline',
    settings: 'settings-outline',
  } as const;
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <RecordingActivityBanner />
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.inkMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            minHeight: 64,
            paddingTop: 7,
          },
          tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={icons[route.name as keyof typeof icons] ?? 'ellipse-outline'}
              color={color}
              size={size}
            />
          ),
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="recordings" options={{ title: 'Recordings' }} />
        <Tabs.Screen name="recorder" options={{ title: 'Recorder' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="enroll" options={{ href: null }} />
        <Tabs.Screen name="recording" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="support" options={{ href: null }} />
        <Tabs.Screen name="delete-account" options={{ href: null }} />
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <Navigation />
    </AppProviders>
  );
}
