import { useRecordingLocation } from '../recording-location/RecordingLocationProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { useEnrollmentSnapshot } from '../enrollment/use-enrollment';
import { usePlaudDevice } from './use-plaud-device';
import { usePlaudSync } from './PlaudSyncProvider';
import {
  initialRecordingActivityMemory,
  updateRecordingActivity,
  type RecordingActivityBannerModel,
  type RecordingActivityMemory,
} from './recording-activity-model';

export function RecordingActivityBanner({ topInset = true }: { topInset?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const enrollment = useEnrollmentSnapshot();
  const { snapshot: device } = usePlaudDevice();
  const { snapshot: sync } = usePlaudSync();
  const { snapshot: location } = useRecordingLocation();
  const [state, setState] = useState<{
    memory: RecordingActivityMemory;
    banner: RecordingActivityBannerModel | null;
  }>({ memory: initialRecordingActivityMemory, banner: null });
  const connected = device.phase === 'ready' && !device.release;
  useEffect(() => {
    setState((previous) =>
      updateRecordingActivity(previous.memory, {
        actorId: enrollment.actorId,
        connected,
        activity: sync.activity,
      }),
    );
  }, [connected, enrollment.actorId, sync.activity]);
  if (!enrollment.actorId || state.memory.actorId !== enrollment.actorId || !state.banner)
    return null;
  const active = state.banner.kind === 'active';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: active ? colors.orangeBg : colors.surfaceAlt,
          borderColor: active ? colors.orangeInk : colors.line,
          paddingTop: 12 + (topInset ? insets.top : 0),
        },
      ]}
    >
      <Ionicons
        name={active ? 'radio-button-on' : 'alert-circle-outline'}
        size={22}
        color={active ? colors.danger : colors.inkSecondary}
      />
      <View style={styles.words}>
        <Text style={[styles.label, { color: colors.ink }]}>{state.banner.label}</Text>
        <Text style={[styles.detail, { color: colors.inkSecondary }]}>{state.banner.detail}</Text>
        {location.enabled ? (
          <Text style={[styles.detail, { color: colors.inkSecondary }]}>
            {location.capturing ? 'Location capture active' : 'Location is not being captured'}
          </Text>
        ) : null}
      </View>
      <Button label="Recorder controls" variant="text" onPress={() => router.push('/recorder')} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  words: { flex: 1, minWidth: 190 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
  detail: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
});
