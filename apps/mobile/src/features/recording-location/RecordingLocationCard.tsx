import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import type { LocalRecording } from '../recordings/recording-model';
import { useRecordingsController } from '../recordings/RecordingsProvider';
import { Button, Card } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { locationMapUrl, type LocationPoint } from './location-model';
export function RecordingLocationCard({ recording }: { recording: LocalRecording }) {
  const { colors } = useTheme();
  const controller = useRecordingsController();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!recording.source) return null;
  const location = recording.location;
  const points = location?.points ?? [];
  const first = points[0];
  const last = points.length > 1 ? points.at(-1) : undefined;
  async function openMap(point: LocationPoint) {
    setError(null);
    const url = locationMapUrl(point, Platform.OS);
    try {
      if (!url) throw new Error();
      await Linking.openURL(url);
    } catch {
      setError('Maps could not be opened. Try again.');
    }
  }
  function pointRow(point: LocationPoint, label: string) {
    return (
      <View key={label} style={styles.point}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        <Text selectable style={[styles.copy, { color: colors.inkSecondary }]}>
          {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
          {'\n'}
          {new Date(point.capturedAt).toLocaleString()} · Accuracy ±{Math.round(point.accuracy)} m
        </Text>
        <Button
          label={`Open ${label.toLowerCase()} in Maps`}
          variant="secondary"
          onPress={() => void openMap(point)}
        />
      </View>
    );
  }
  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        Recording location
      </Text>
      {first ? (
        <>
          {pointRow(first, 'First captured location')}
          {last ? pointRow(last, 'Last captured location') : null}
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            {points.length} location {points.length === 1 ? 'point' : 'points'} saved during this
            recording. These are phone locations; GPS may be less accurate indoors.
          </Text>
          {location?.status === 'interrupted' || location?.reason || location?.droppedPoints ? (
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Coverage is partial. Some locations were unavailable or capture was interrupted.
            </Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.inkSecondary }]}>
            Opening Maps shares the selected coordinates with your map provider. Audio and notes are
            not shared.
          </Text>
        </>
      ) : (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {recording.locationRemovalPending
            ? 'Location removal is incomplete. Retry to remove the remaining saved copy.'
            : location === null
              ? 'Location removed.'
              : 'Location unavailable. Capture must be enabled and connected when you record; importing audio later cannot recover its original location.'}
        </Text>
      )}
      {location || recording.locationRemovalPending ? (
        <Button
          label={recording.locationRemovalPending ? 'Retry location removal' : 'Remove location'}
          variant="text"
          disabled={removing}
          onPress={() => setConfirmRemove(true)}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      <ConfirmationDialog
        visible={confirmRemove}
        title="Remove this recording’s location?"
        description="This removes the saved locations from this phone. Your audio, notes and transcript stay in the app."
        confirmLabel="Remove location"
        loading={removing}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          if (removing) return;
          setRemoving(true);
          setError(null);
          void controller
            .removeLocation(recording.id)
            .then((removed) => {
              if (!removed) setError('Location could not be removed. Try again.');
              setConfirmRemove(false);
            })
            .finally(() => setRemoving(false));
        }}
      />
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12 },
  point: { gap: 8 },
  title: { fontFamily: fontFamily.semibold, fontSize: 17 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19 },
});
