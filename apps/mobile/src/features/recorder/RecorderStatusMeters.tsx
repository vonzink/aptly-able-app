import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedMeter } from '../../ui/AnimatedMeter';
import { fontFamily, useTheme } from '../../ui/theme';
import type { RecorderStorage } from '../plaud-device/plaud-status-port';

export function RecorderStatusMeters({
  batteryPercent,
  charging,
  storage,
}: {
  batteryPercent: number | null;
  charging: boolean | null;
  storage: RecorderStorage | null;
}) {
  const { colors } = useTheme();
  const used =
    storage && storage.totalBytes > 0
      ? Math.max(0, Math.min(100, Math.round((1 - storage.freeBytes / storage.totalBytes) * 100)))
      : null;
  const gb = (bytes: number) => (bytes / 1_000_000_000).toFixed(1);
  return (
    <View style={styles.meters}>
      <Meter
        label="Battery"
        percent={batteryPercent}
        icon={charging ? 'battery-charging-outline' : 'battery-half-outline'}
        color={batteryPercent !== null && batteryPercent <= 20 ? colors.danger : colors.mintInk}
        detail={
          batteryPercent === null
            ? 'Waiting for reading'
            : charging
              ? 'Charging'
              : 'Charge remaining'
        }
      />
      <Meter
        label="Storage used"
        percent={used}
        icon="server-outline"
        color={used !== null && used >= 90 ? colors.danger : colors.accent}
        detail={
          storage
            ? `${gb(storage.freeBytes)} GB free of ${gb(storage.totalBytes)} GB`
            : 'Waiting for reading'
        }
      />
    </View>
  );
}

function Meter({
  label,
  percent,
  icon,
  color,
  detail,
}: {
  label: string;
  percent: number | null;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  detail: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.meter, { backgroundColor: colors.bg }]}>
      <View style={styles.heading}>
        <Ionicons name={icon} size={20} color={color} />
        <Text style={[styles.label, { color: colors.inkSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: colors.ink }]}>
        {percent === null ? '—' : `${percent}%`}
      </Text>
      <AnimatedMeter label={`Recorder ${label.toLowerCase()}`} percent={percent} color={color} />
      <Text style={[styles.detail, { color: colors.inkSecondary }]}>{detail}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  meters: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  meter: { flex: 1, minWidth: 132, borderRadius: 14, padding: 14, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
  value: { fontFamily: fontFamily.bold, fontSize: 28, fontVariant: ['tabular-nums'] },
  detail: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
});
