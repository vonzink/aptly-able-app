import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../ui/components';
import { MediaControl } from '../../ui/MediaControl';
import { fontFamily, useTheme } from '../../ui/theme';
import { usePlaudSync } from './PlaudSyncProvider';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';

export function PlaudRecorderControls() {
  const { controller, snapshot } = usePlaudSync();
  const { colors } = useTheme();
  const { activity, busy, command, controlsAvailable, sessionId } = snapshot;
  const [confirmStart, setConfirmStart] = useState(false);
  useEffect(() => setConfirmStart(false), [activity]);
  const labels = {
    unknown: 'Reading recorder state',
    idle: 'Ready to record',
    recording: 'Recording',
    paused: 'Recording paused',
  };
  return (
    <Card style={styles.card}>
      <Text style={[styles.label, { color: colors.inkSecondary }]}>Record on your Plaud</Text>
      <View style={styles.heading}>
        <Ionicons
          name={activity === 'recording' ? 'radio-button-on' : 'mic-outline'}
          size={24}
          color={activity === 'recording' ? colors.danger : colors.accent}
        />
        <Text accessibilityLiveRegion="polite" style={[styles.title, { color: colors.ink }]}>
          {labels[activity]}
        </Text>
      </View>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        {command
          ? 'Waiting for your recorder to confirm…'
          : !controlsAvailable
            ? 'Update the phone app to use recorder controls.'
            : busy
              ? 'Recorder controls will be available when the current transfer finishes.'
              : 'Control your nearby Plaud recorder here. Stop to finish and receive the recording.'}
      </Text>
      {snapshot.message && snapshot.transport !== 'wifi' && !snapshot.wifiQueued ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.copy, { color: colors.inkSecondary }]}
        >
          {snapshot.message}
        </Text>
      ) : null}
      {controlsAvailable ? (
        <>
          {activity === 'idle' ? (
            <View style={styles.controls}>
              <MediaControl
                icon="radio-button-on"
                label="Start recording"
                prominent
                recording
                disabled={busy}
                loading={command === 'start'}
                onPress={() => setConfirmStart(true)}
              />
            </View>
          ) : activity === 'unknown' ? (
            <Button
              label="Refresh recorder state"
              variant="secondary"
              disabled={busy}
              onPress={() => void controller.sync()}
            />
          ) : (
            <View style={styles.controls}>
              {sessionId !== null ? (
                <MediaControl
                  icon={activity === 'paused' ? 'play' : 'pause'}
                  label={activity === 'paused' ? 'Resume' : 'Pause'}
                  disabled={busy}
                  loading={command === 'pause' || command === 'resume'}
                  onPress={() =>
                    void controller.control(activity === 'paused' ? 'resume' : 'pause')
                  }
                />
              ) : (
                <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                  This recording began before the app connected. Use the recorder’s button to pause
                  it, or stop it here.
                </Text>
              )}
              <MediaControl
                icon="stop"
                label="Stop & save"
                prominent
                recording
                disabled={busy}
                loading={command === 'stop'}
                onPress={() => void controller.control('stop')}
              />
            </View>
          )}
        </>
      ) : null}
      <ConfirmationDialog
        visible={confirmStart}
        title="Before you record"
        description="Make sure everyone can see or hear that the Plaud recorder is active. Tell participants you are recording and get any permission required where you are. Aptly Able does not use the phone microphone."
        confirmLabel="Participants are aware — start"
        cancelLabel="Not yet"
        loading={command === 'start'}
        disabled={activity !== 'idle' || busy}
        onConfirm={() => {
          setConfirmStart(false);
          void controller.control('start');
        }}
        onCancel={() => setConfirmStart(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 8,
  },
  label: { fontFamily: fontFamily.medium, fontSize: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 29, flex: 1 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
});
