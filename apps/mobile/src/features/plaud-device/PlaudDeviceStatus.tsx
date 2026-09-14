import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { plaudStatus } from '../../services/plaud-status';
import { Button } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecorderStatusMeters } from '../recorder/RecorderStatusMeters';
import { createPlaudStatusController } from './plaud-status-controller';

/** Mounted only for a ready connection. Telemetry failure never changes pairing state. */
export function PlaudDeviceStatus({
  connectionKey,
  paused = false,
}: {
  connectionKey: string;
  paused?: boolean;
}) {
  const controller = useMemo(() => createPlaudStatusController(plaudStatus), []);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { colors } = useTheme();
  useEffect(() => {
    controller.setPaused(paused);
  }, [controller, paused]);
  useEffect(() => {
    controller.setConnection(connectionKey);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') controller.refresh();
    });
    return () => {
      subscription.remove();
      controller.setConnection(null);
    };
  }, [connectionKey, controller]);

  return (
    <View>
      <RecorderStatusMeters
        batteryPercent={snapshot.batteryPercent}
        charging={snapshot.charging}
        storage={snapshot.storage}
      />
      {snapshot.batteryPercent !== null && snapshot.batteryPercent <= 20 && !snapshot.charging ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          Battery is low. Charge your recorder before a long session.
        </Text>
      ) : null}
      {snapshot.storage && snapshot.storage.freeBytes / snapshot.storage.totalBytes <= 0.1 ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          Recorder storage is nearly full. Save important recordings before freeing space on the recorder.
        </Text>
      ) : null}
      {paused ? (
        <Text style={[styles.message, { color: colors.inkSecondary }]}>
          Showing the last readings received. Readings refresh after the current operation.
        </Text>
      ) : null}
      {!snapshot.available || snapshot.message ? (
        <Text style={[styles.message, { color: colors.inkSecondary }]}>
          {snapshot.available
            ? snapshot.message
            : 'Recorder readings are unavailable in this app build.'}
        </Text>
      ) : null}
      {snapshot.available ? (
        <Button
          label={snapshot.refreshing ? 'Reading recorder…' : 'Refresh readings'}
          variant="text"
          loading={snapshot.refreshing}
          disabled={paused}
          onPress={() => controller.refresh()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
