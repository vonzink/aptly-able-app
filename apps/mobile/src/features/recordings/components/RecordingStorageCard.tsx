import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button, Card } from '../../../ui/components';
import { ConfirmationDialog } from '../../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../../ui/theme';
import { useRecordingStorageUsage, useRecordingsController } from '../RecordingsProvider';
import { TEMPORARY_AUDIO_BYTES } from '../recording-model';

export function RecordingStorageCard() {
  const { colors } = useTheme();
  const usage = useRecordingStorageUsage();
  const controller = useRecordingsController();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const inFlight = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void controller.reload();
      return () => {
        setConfirmClear(false);
        setCleared(false);
      };
    }, [controller]),
  );

  async function clearAudio() {
    if (inFlight.current || controller.getSnapshot().busy) return;
    inFlight.current = true;
    setClearing(true);
    try {
      setCleared(await controller.clearTemporaryAudio());
    } finally {
      inFlight.current = false;
      setClearing(false);
      setConfirmClear(false);
    }
  }
  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        Audio storage
      </Text>
      {usage.loading ? (
        <ActivityIndicator accessibilityLabel="Checking audio storage" color={colors.accent} />
      ) : (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Temporary audio: {(usage.temporaryBytes / 1024 / 1024).toFixed(1)} of{' '}
          {TEMPORARY_AUDIO_BYTES / 1024 / 1024} MB
          {'\n'}Kept offline and imported: {(usage.retainedBytes / 1024 / 1024).toFixed(1)} MB
        </Text>
      )}
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Includes audio from all accounts used in this app on this device. Older temporary audio is
        cleared as needed. Open a recording and choose Keep offline in app to retain it.
      </Text>
      {usage.incomplete ? (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Some saved entries could not be read, so these totals may be incomplete.
        </Text>
      ) : null}
      {usage.error ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {usage.error}
        </Text>
      ) : null}
      {usage.error || usage.incomplete ? (
        <Button
          label="Check storage again"
          variant="text"
          loading={usage.busy}
          onPress={() => void controller.reload()}
        />
      ) : null}
      {usage.temporaryBytes > 0 ? (
        <Button
          label="Clear temporary audio"
          variant="secondary"
          disabled={usage.loading || usage.busy}
          loading={clearing}
          onPress={() => {
            controller.clearError();
            setCleared(false);
            setConfirmClear(true);
          }}
        />
      ) : null}
      {cleared ? (
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: colors.mintInk }]}>
          Available temporary audio cleared. Audio open in a player was kept.
        </Text>
      ) : null}
      <Text style={[styles.hint, { color: colors.inkSecondary }]}>
        Clearing keeps your library entries, transcripts, notes, imported audio and offline copies.
        Reconnect the original recorder to load cleared audio again.
      </Text>
      <ConfirmationDialog
        visible={confirmClear}
        title="Clear temporary audio?"
        description="This removes temporary audio stored by Aptly Able on this device, including audio from earlier sign-ins. You will need the original recorder nearby to listen to cleared audio again."
        confirmLabel="Clear temporary audio"
        cancelLabel="Keep audio"
        loading={clearing}
        disabled={usage.busy || usage.loading}
        onConfirm={() => void clearAudio()}
        onCancel={() => setConfirmClear(false)}
      >
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Library entries, transcripts, notes, imported files and offline copies stay in the app.
          Audio currently open in a player is kept.
        </Text>
      </ConfirmationDialog>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { fontFamily: fontFamily.semibold, fontSize: 17 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19 },
});
