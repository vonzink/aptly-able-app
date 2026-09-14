import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { usePlaudSync } from './PlaudSyncProvider';

export function RecorderSyncCard() {
  const { controller, snapshot } = usePlaudSync();
  const { colors } = useTheme();
  const router = useRouter();
  const simulation = Constants.expoConfig?.extra?.recorderMode === 'mock';
  if (simulation) {
    return (
      <Card style={{ gap: 8, padding: 14 }}>
        <Text style={{ fontFamily: fontFamily.semibold, fontSize: 16, color: colors.ink, flex: 1 }}>
          Recorder preview
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 14,
            lineHeight: 21,
            color: colors.inkSecondary,
          }}
        >
          Recorder connection is simulated in this build. You can import audio below to test
          playback and storage. Real Plaud transfers need a physical phone.
        </Text>
        <Button
          variant="secondary"
          label="Open recorder simulation"
          onPress={() => router.push('/recorder')}
        />
      </Card>
    );
  }
  const busy = snapshot.busy;
  const needsConnection = snapshot.phase === 'waiting' || snapshot.phase === 'unavailable';
  const message =
    snapshot.message ??
    {
      unavailable: 'Open Aptly Able on your phone to receive audio from your recorder.',
      waiting: 'Connect your paired recorder to receive new recordings automatically.',
      checking: 'Checking your recorder for new recordings…',
      'connecting-wifi':
        'Connecting to your recorder’s Wi-Fi. Allow the phone’s connection prompt…',
      syncing: `Receiving over ${snapshot.transport === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}${snapshot.progress === null ? '' : ` · ${Math.round(snapshot.progress)}%`}…`,
      recording: 'Your recorder is recording or paused. Audio will transfer after you stop.',
      idle: 'Your recorder is connected. New recordings sync automatically while the app is open.',
      error: 'Recording transfer needs attention. Keep your recorder nearby and try again.',
    }[snapshot.phase];
  return (
    <Card style={{ gap: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Ionicons name="radio-outline" size={24} color={colors.accent} />
        )}
        <Text style={{ fontFamily: fontFamily.semibold, fontSize: 16, color: colors.ink, flex: 1 }}>
          From your Plaud recorder
        </Text>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          fontFamily: fontFamily.regular,
          fontSize: 14,
          lineHeight: 21,
          color: colors.inkSecondary,
        }}
      >
        {message}
      </Text>
      {snapshot.phase !== 'recording' ? (
        <Button
          variant="text"
          label={needsConnection ? 'Open recorder' : 'Check for new recordings'}
          loading={busy}
          onPress={() => (needsConnection ? router.push('/recorder') : void controller.sync())}
        />
      ) : null}
      {!needsConnection && snapshot.wifiAvailable ? (
        <Button
          label="Wi-Fi transfer options"
          variant="text"
          onPress={() => router.push('/recorder')}
        />
      ) : null}
    </Card>
  );
}
