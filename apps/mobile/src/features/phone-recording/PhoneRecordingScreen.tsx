import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, PageHeader, Screen } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { usePhoneRecording } from './PhoneRecordingProvider';
import { durationLabel } from '../recordings/presentation';
import { isStoreRelease } from '../../services/release-profile';
export default function PhoneRecordingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { controller, snapshot: state, available } = usePhoneRecording();
  const [discard, setDiscard] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const active = state.phase === 'recording';
  const paused = state.phase === 'paused';
  async function save() {
    const id = await controller.save();
    if (id) router.replace({ pathname: '/recording', params: { id } });
  }
  return (
    <Screen>
      <Button
        label="Back to recordings"
        variant="text"
        onPress={() => router.push('/recordings')}
      />
      <PageHeader
        title="Record audio"
        copy="Use your phone’s microphone. No Plaud recorder needed."
      />
      {!available ? (
        <Card>
          <Text style={{ color: colors.ink }}>
            Use the updated iPhone or Android app to record audio. The website supports importing
            audio files.
          </Text>
        </Card>
      ) : !state.actorId ? (
        <Card>
          <Text style={{ color: colors.ink }}>
            Sign in so your phone recordings stay with your account on this phone.
          </Text>
          <Button label="Sign in" onPress={() => router.push('/enroll')} />
        </Card>
      ) : (
        <>
          <Card style={styles.panel}>
            <View
              style={[
                styles.symbol,
                { backgroundColor: active ? colors.danger : colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name={active ? 'mic' : paused ? 'pause' : 'mic-outline'}
                size={38}
                color={active ? '#fff' : colors.accent}
              />
            </View>
            <Text accessibilityRole="header" style={[styles.status, { color: colors.ink }]}>
              {active
                ? 'Recording on your phone'
                : paused
                  ? 'Recording paused'
                  : state.draft
                    ? 'Ready to save'
                    : 'Ready to record'}
            </Text>
            <Text
              accessibilityLabel={`Recorded ${durationLabel(state.seconds)}`}
              style={[styles.timer, { color: colors.ink }]}
            >
              {durationLabel(state.seconds)}
            </Text>
            {!state.draft ? (
              <Button
                label="Start recording"
                loading={state.busy}
                disabled={!state.ready}
                onPress={() => void controller.start()}
              />
            ) : null}
            {active ? (
              <Button
                label="Pause recording"
                variant="secondary"
                loading={state.busy}
                onPress={() => void controller.pause()}
              />
            ) : null}
            {paused ? (
              <Button
                label="Resume recording"
                loading={state.busy}
                onPress={() => void controller.resume()}
              />
            ) : null}
            {active || paused ? (
              <Button
                label="Stop recording"
                loading={state.busy}
                onPress={() => void controller.stop()}
              />
            ) : null}
            {state.draft && state.phase === 'review' ? (
              <Button
                label={state.savedId ? 'Finish saving' : 'Save recording'}
                loading={state.busy}
                onPress={() => void save()}
              />
            ) : null}
            {state.draft && !state.savedId ? (
              <Button
                label="Discard recording"
                variant="text"
                disabled={state.busy}
                onPress={() => setDiscard(true)}
              />
            ) : null}
            {state.error || permissionError ? (
              <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
                {permissionError
                  ? 'Open your phone Settings directly to allow microphone access.'
                  : state.error}
              </Text>
            ) : null}
            {!state.ready && !state.busy ? (
              <Button
                label="Retry recording setup"
                variant="secondary"
                onPress={() => void controller.activate(state.actorId)}
              />
            ) : null}
            {state.error && !state.draft ? (
              <Button
                label="Open phone permissions"
                variant="text"
                onPress={() => void Linking.openSettings().catch(() => setPermissionError(true))}
              />
            ) : null}
          </Card>
          <Card style={{ gap: 10 }}>
            <Text style={[styles.copy, { color: colors.ink }]}>
              Make sure everyone knows you are recording and agrees before you start.
            </Text>
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Recording continues while the screen is locked or you switch apps. Supported iPhones
              show a Live Activity when enabled; tap it to open these controls. Android shows a
              recording notification with a Stop button. Calls and audio interruptions may pause or
              end recording; check the status before continuing.
            </Text>
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Up to 2 hours per recording. Save it to keep it in your library, add a title and
              notes, or delete it later. Unfinished recordings use temporary storage and may be lost
              if the app is force-closed or the phone runs out of space.
            </Text>
            {!isStoreRelease ? (
              <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                After saving, choose Generate transcript to send audio to Aptly Able and Plaud when
                the server is ready. You will be asked to agree before uploading. You can record and
                save without an internet connection.
              </Text>
            ) : null}
          </Card>
        </>
      )}
      <ConfirmationDialog
        visible={discard}
        title="Discard this recording?"
        description="This removes the unfinished audio from this phone. It has not been uploaded."
        confirmLabel="Discard recording"
        cancelLabel="Keep recording"
        loading={state.busy}
        onConfirm={() => void controller.discard().then(() => setDiscard(false))}
        onCancel={() => setDiscard(false)}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 16 },
  symbol: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  status: { fontFamily: fontFamily.semibold, fontSize: 20, textAlign: 'center' },
  timer: {
    fontFamily: fontFamily.bold,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
});
