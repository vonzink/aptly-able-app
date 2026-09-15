import type { ReactNode } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import type { SessionSnapshot } from '@aptly/api-client';
import { Button, Card, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { usePathname, useRouter } from 'expo-router';
export function SessionRestoration({
  state,
  onRetry,
  onSignOut,
  children,
}: {
  state: SessionSnapshot;
  onRetry(): void;
  onSignOut(): void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const path = usePathname();
  const router = useRouter();
  // Privacy, help and a deletion receipt must remain accessible offline or signed out.
  if (['/privacy', '/support', '/delete-account'].includes(path)) return children;
  if (state.phase !== 'restoring' && state.phase !== 'restore-error' && !state.cleanupPending)
    return children;
  return (
    <Screen>
      <Card style={{ gap: 16 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.ink, fontSize: 20, fontWeight: '600' }}
        >
          {state.cleanupPending
            ? 'Finish signing out'
            : state.phase === 'restoring'
              ? 'Restoring your sign-in'
              : 'Sign-in could not be restored'}
        </Text>
        {state.phase === 'restoring' ? (
          <ActivityIndicator accessibilityLabel="Restoring sign-in" color={colors.accent} />
        ) : (
          <>
            <Text accessibilityRole="alert" style={{ color: colors.inkSecondary, lineHeight: 22 }}>
              {state.message}
            </Text>
            {!state.cleanupPending && <Button label="Retry" onPress={onRetry} />}
            <Button
              variant="secondary"
              label={state.cleanupPending ? 'Retry sign out' : 'Sign in with another account'}
              onPress={onSignOut}
            />
          </>
        )}
        <Button label="Help & support" variant="text" onPress={() => router.push('/support')} />
        <Button label="Privacy" variant="text" onPress={() => router.push('/privacy')} />
      </Card>
    </Screen>
  );
}
