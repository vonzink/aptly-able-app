import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useEnrollmentController, useEnrollmentSnapshot } from '../../bootstrap/AppProviders';
import { Button, Card, Screen } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { LocalAccessCard } from '../session/LocalAccessCard';
import { RecorderIdentityCard } from '../recorder/RecorderIdentityCard';
import { RecorderPairingCard } from './RecorderPairingCard';
import { PlaudRecorderControls } from './PlaudRecorderControls';
import { PlaudWifiTransferCard } from './PlaudWifiTransferCard';
import { usePlaudSync } from './PlaudSyncProvider';
import { PlaudDeviceStatus } from './PlaudDeviceStatus';
import type { PlaudDevicePhase } from './plaud-device-controller';
import { usePlaudDevice } from './use-plaud-device';

const progress: Partial<Record<PlaudDevicePhase, { title: string; copy: string }>> = {
  preparing: {
    title: 'Preparing your recorder',
    copy: 'Checking your assignment and starting Bluetooth.',
  },
  scanning: {
    title: 'Looking for your recorder',
    copy: 'Keep your assigned recorder nearby and powered on.',
  },
  binding: {
    title: 'Saving your pairing',
    copy: 'Connecting your assigned recorder to your account.',
  },
  connecting: {
    title: 'Finishing secure setup',
    copy: 'Keep the recorder nearby while it confirms the secure connection.',
  },
  disconnecting: {
    title: 'Disconnecting',
    copy: 'Waiting for the recorder to confirm disconnection.',
  },
  unpairing: {
    title: 'Unpairing your recorder',
    copy: 'Confirming release from your account and the recorder.',
  },
};

export default function PlaudDeviceScreen() {
  const { controller, snapshot } = usePlaudDevice();
  const { snapshot: sync } = usePlaudSync();
  const enrollmentController = useEnrollmentController();
  const enrollment = useEnrollmentSnapshot();
  const router = useRouter();
  const { colors } = useTheme();
  const waiting = progress[snapshot.phase];
  const activeOperation = enrollment.operation?.status === 'pending';
  const recoveringRelease = snapshot.release !== null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.orangeInk }]}>
          {enrollment.operation ? 'YOUR ASSIGNED RECORDER' : 'YOUR RECORDER'}
        </Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {snapshot.phase === 'ready'
            ? 'Your Plaud recorder'
            : enrollment.operation
              ? 'Connect your Plaud'
              : 'Set up a recorder'}
        </Text>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {snapshot.phase === 'ready'
            ? 'Manage your recorder and receive recordings.'
            : 'Set up your recorder with Bluetooth on your phone.'}
        </Text>
      </View>

      {snapshot.phase === 'unavailable' ? (
        <Card style={styles.card}>
          <Ionicons name="phone-portrait-outline" size={32} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.ink }]}>A phone build is required</Text>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Install the Aptly Able native build on a physical iPhone or Android phone to connect
            your NotePin S. Bluetooth recorder connection is unavailable in a browser or Expo Go.
          </Text>
          <Button
            label="Open recorder enrollment"
            variant="secondary"
            onPress={() => router.push('/enroll')}
          />
        </Card>
      ) : !enrollment.actorId ? (
        <LocalAccessCard
          loading={enrollment.phase === 'signing-in'}
          message={enrollment.message}
          onSubmit={(code) => void enrollmentController.signIn(code)}
        />
      ) : !enrollment.operation ? (
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>No recorder connected</Text>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Open an enrollment invitation to add a recorder. After unpairing, create a new
            assignment and invitation in the dashboard to set it up again.
          </Text>
          {enrollment.message ? (
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>{enrollment.message}</Text>
          ) : null}
          {enrollment.phase === 'recovery-error' ? (
            <Button
              label="Retry enrollment recovery"
              variant="secondary"
              onPress={() => void enrollmentController.retryRecovery()}
            />
          ) : null}
          <Button label="Open recorder enrollment" onPress={() => router.push('/enroll')} />
        </Card>
      ) : (
        <>
          {snapshot.assignment ? (
            <RecorderIdentityCard
              model={snapshot.assignment.model}
              serialSuffix={snapshot.assignment.serial.slice(-4)}
              connected={snapshot.phase === 'ready' && !recoveringRelease}
              status={
                snapshot.phase === 'ready'
                  ? recoveringRelease
                    ? 'Connected · finish unpairing'
                    : 'Connected and ready'
                  : snapshot.phase === 'found'
                    ? 'Your recorder is nearby'
                    : snapshot.phase === 'unpaired'
                      ? 'Unpaired'
                      : 'Not connected'
              }
            >
              {snapshot.phase === 'ready' && !recoveringRelease ? (
                <PlaudDeviceStatus
                  key={`${enrollment.actorId}:${snapshot.assignment.serial}`}
                  connectionKey={`${enrollment.actorId}:${snapshot.assignment.serial}`}
                  paused={sync.busy}
                />
              ) : null}
            </RecorderIdentityCard>
          ) : null}

          {snapshot.phase === 'ready' && !recoveringRelease ? (
            <>
              <PlaudRecorderControls />
              <PlaudWifiTransferCard />
            </>
          ) : null}

          {snapshot.message ? (
            <View
              accessibilityRole={snapshot.phase === 'error' ? 'alert' : undefined}
              style={[
                styles.notice,
                {
                  backgroundColor: snapshot.phase === 'error' ? colors.dangerBg : colors.surfaceAlt,
                },
              ]}
            >
              <Text style={[styles.copy, { color: colors.ink }]}>{snapshot.message}</Text>
            </View>
          ) : null}

          {waiting ? (
            <Card style={styles.card}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.cardTitle, { color: colors.ink }]}>{waiting.title}</Text>
              <Text style={[styles.copy, { color: colors.inkSecondary }]}>{waiting.copy}</Text>
              <Button label="Cancel" variant="text" onPress={() => controller.cancel()} />
            </Card>
          ) : snapshot.phase === 'found' ? (
            <Button
              label={
                recoveringRelease ? 'Reconnect to finish unpairing' : 'Connect assigned recorder'
              }
              onPress={() => void controller.connect()}
            />
          ) : snapshot.phase === 'ready' ? (
            <>
              {!recoveringRelease ? (
                <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                  Your recorder has confirmed its secure connection. Finished recordings sync
                  automatically while the app is open. Find them under Recordings.
                </Text>
              ) : null}
              <Button
                label="Disconnect recorder"
                disabled={sync.busy}
                variant="secondary"
                onPress={() => void controller.disconnect()}
              />
            </>
          ) : activeOperation && !snapshot.release?.device && snapshot.phase !== 'unpaired' ? (
            <>
              <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                Keep your recorder powered on and nearby. Allow Bluetooth access when your phone
                asks. Only your assigned recorder will appear.
              </Text>
              <Button
                label={
                  recoveringRelease
                    ? 'Reconnect to finish unpairing'
                    : snapshot.phase === 'idle' && !snapshot.assignment
                      ? 'Search for my recorder'
                      : 'Search and reconnect'
                }
                onPress={() => void controller.scan()}
              />
            </>
          ) : null}

          {!activeOperation ? (
            <Button
              label="Open a new enrollment"
              variant="secondary"
              onPress={() => router.push('/enroll')}
            />
          ) : null}

          {!waiting &&
          (snapshot.pairingAttempted ||
            snapshot.cloudBound ||
            recoveringRelease ||
            snapshot.phase === 'ready' ||
            !activeOperation) ? (
            <RecorderPairingCard
              key={`${enrollment.actorId}:${enrollment.operation.id}:${snapshot.assignment?.serial}`}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10 },
  eyebrow: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 1.2 },
  title: { fontFamily: fontFamily.bold, fontSize: 31, lineHeight: 38 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  card: { gap: 14 },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 19, lineHeight: 26 },
  notice: { borderRadius: 12, padding: 14 },
});
