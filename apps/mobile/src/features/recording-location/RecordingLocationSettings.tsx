import { useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { useRecordingLocation } from './RecordingLocationProvider';
import type { LocationSnapshot } from './location-controller';

function statusCopy(state: LocationSnapshot): string {
  if (!state.available) return 'Available in an updated iPhone or Android app.';
  if (!state.actorId) return 'Sign in to manage recording location on this phone.';
  if (state.reason === 'storage')
    return 'Location capture is stopped because storage is unavailable. Your switch shows the last saved preference; retry turning it off before restarting the app.';
  if (state.permission === 'denied')
    return 'Location permission is off. Your recordings still work. Open phone permissions to allow location, then enable this switch.';
  if (!state.enabled) return 'Off. Your recordings work normally without location.';
  if (state.capturing) return 'Saving location for the current recording.';
  if (state.permission === 'undetermined')
    return 'Location permission is needed. Open phone settings to allow access.';
  if (!state.serial) return 'Enabled. Connect your assigned recorder to prepare location capture.';
  if (!state.backgroundReady)
    return Platform.OS === 'android'
      ? 'Location capture is not ready. Allow location and notifications in phone settings, then return to the app and reconnect your recorder.'
      : 'Foreground capture is available. Keep the app open until background location is ready.';
  if (state.reason === 'interrupted')
    return 'Capture was interrupted. Check permissions and reconnect before your next recording.';
  return 'Ready for the next Plaud recording. Keep Bluetooth connected.';
}
export function RecordingLocationSettings() {
  const { colors } = useTheme();
  const { controller, snapshot } = useRecordingLocation();
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [linkError, setLinkError] = useState(false);
  async function openSettings() {
    setLinkError(false);
    try {
      await Linking.openSettings();
    } catch {
      setLinkError(true);
    }
  }
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.ink }]}>Save location during recordings</Text>
        <Switch
          accessibilityLabel="Save location during recordings"
          value={snapshot.enabled}
          disabled={!snapshot.available || !snapshot.actorId || snapshot.busy}
          trackColor={{ true: colors.accent }}
          onValueChange={(enabled) => {
            if (enabled) setConfirmEnable(true);
            else void controller.setEnabled(false);
          }}
        />
      </View>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Your Plaud’s record button starts location capture on this phone. Capture stops when you
        stop recording, disconnect, sign out or turn this off.
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.copy, { color: snapshot.capturing ? colors.mintInk : colors.inkSecondary }]}
      >
        {snapshot.busy ? 'Checking location access…' : statusCopy(snapshot)}
      </Text>
      {snapshot.enabled && snapshot.permission === 'foreground' && Platform.OS === 'ios' ? (
        <Button
          label="Allow starts while phone is locked"
          variant="secondary"
          loading={snapshot.busy}
          onPress={() => void controller.requestBackground()}
        />
      ) : null}
      {snapshot.available &&
      snapshot.actorId &&
      (snapshot.enabled || snapshot.permission === 'denied') ? (
        <>
          <Button
            label="Open phone permissions"
            variant="text"
            onPress={() => void openSettings()}
          />
          <Text style={[styles.hint, { color: colors.inkSecondary }]}>
            {Platform.OS === 'android'
              ? 'Android shows an ongoing notification while location capture is armed. After reopening the app, reconnect your recorder before recording.'
              : 'For starts with the phone locked, select Always in Location permissions. Keep Aptly Able running in the background.'}
          </Text>
        </>
      ) : null}
      <Text style={[styles.hint, { color: colors.inkSecondary }]}>
        Locations stay on this phone. Nothing is sent to Aptly Able or Plaud for this feature.
        Location is unavailable when the app cannot receive the recorder’s signal, including after
        force-closing the app.
      </Text>
      {snapshot.error || linkError ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {snapshot.error ??
            'Phone settings could not be opened. Open them directly from your home screen.'}
        </Text>
      ) : null}
      <ConfirmationDialog
        visible={confirmEnable && !!snapshot.actorId}
        title="Save your recording locations?"
        description="Aptly Able will use your phone’s location during recordings started on your connected Plaud, including while the screen is locked when background access is ready. Locations are saved with the recording on this phone. They are not uploaded. You can remove a recording’s location or turn this off anytime. Allow location access in the next phone prompt."
        confirmLabel="Enable recording location"
        confirmVariant="primary"
        cancelLabel="Keep location off"
        loading={snapshot.busy}
        onConfirm={() => {
          void controller.setEnabled(true).finally(() => setConfirmEnable(false));
        }}
        onCancel={() => setConfirmEnable(false)}
      />
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 24 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19 },
});
