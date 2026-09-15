import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { usePlaudSync } from './PlaudSyncProvider';
import type { PlaudSyncSnapshot } from './plaud-sync-model';
import { transferRecovery } from './transfer-recovery';

function transferMessage(snapshot: PlaudSyncSnapshot): string | null {
  const recovery = transferRecovery(snapshot);
  if (recovery?.action === 'restart-app') return recovery.message;
  if (snapshot.wifiQueued) return 'Wi-Fi will start after the current operation finishes.';
  if (snapshot.cancelling)
    return 'Stopping transfer. Reopen the app if the recorder does not release the file.';
  if (snapshot.transport !== 'wifi') return null;
  if (snapshot.message) return snapshot.message;
  if (snapshot.busy) {
    if (snapshot.phase === 'saving') return 'Saving the recording on this phone…';
    if (snapshot.phase === 'connecting-wifi') return 'Connecting to your recorder’s Wi-Fi…';
    if (snapshot.phase === 'syncing') {
      const current = Math.min(snapshot.completed + 1, snapshot.total);
      const progress = snapshot.progress === null ? '' : ` · ${Math.round(snapshot.progress)}%`;
      return `Receiving ${current} of ${snapshot.total}${progress}`;
    }
    return 'Preparing Wi-Fi transfer…';
  }
  if (snapshot.phase !== 'idle') return null;
  return snapshot.total
    ? `${snapshot.completed} of ${snapshot.total} recordings received.`
    : 'No new recordings to receive.';
}

export function PlaudWifiTransferCard() {
  const { controller, snapshot } = usePlaudSync();
  const { colors } = useTheme();
  if (!snapshot.wifiAvailable) return null;
  const { activity, transport, busy, wifiQueued, cancelling } = snapshot;
  const active = busy && transport === 'wifi';
  const canRequest =
    snapshot.wifiAvailable && !active && !wifiQueued && !snapshot.command && activity === 'idle';
  const status = transferMessage(snapshot);
  return (
    <Card style={styles.card}>
      <SectionLabel>RECORDING TRANSFER</SectionLabel>
      <View style={styles.heading}>
        <Ionicons name="wifi-outline" size={24} color={colors.accent} />
        <Text style={[styles.title, { color: colors.ink }]}>Transfer over Wi-Fi</Text>
      </View>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Receive new recordings using your recorder’s Wi-Fi hotspot. Keep Bluetooth on, allow the
        phone’s connection prompt, and keep Aptly Able open. Your phone may temporarily lose
        internet access.
      </Text>
      {status ? (
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: colors.ink }]}>
          {status}
        </Text>
      ) : null}
      {snapshot.restartRequired ? null : active || wifiQueued ? (
        <Button
          label={
            cancelling
              ? 'Stopping Wi-Fi…'
              : wifiQueued
                ? 'Cancel Wi-Fi request'
                : 'Cancel Wi-Fi transfer'
          }
          variant="secondary"
          disabled={cancelling}
          onPress={() => controller.cancelWifi()}
        />
      ) : (
        <Button
          label={busy ? 'Use Wi-Fi after this recording' : 'Receive new recordings over Wi-Fi'}
          disabled={!canRequest}
          onPress={() => void controller.syncWifi()}
        />
      )}
      {activity === 'recording' || activity === 'paused' ? (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Stop the recording before transferring audio.
        </Text>
      ) : null}
      {transport === 'wifi' && !busy && (snapshot.phase === 'error' || snapshot.message) ? (
        <Button
          label="Use Bluetooth"
          variant="secondary"
          disabled={activity !== 'idle'}
          onPress={() => void controller.sync()}
        />
      ) : null}
      <Text style={[styles.detail, { color: colors.inkSecondary }]}>
        Bluetooth sync remains automatic. Both methods use the same limited phone cache. To retain
        audio, open a recording and choose Keep offline in app. This does not upload recordings to
        the server.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 18, flex: 1 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  detail: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
});
