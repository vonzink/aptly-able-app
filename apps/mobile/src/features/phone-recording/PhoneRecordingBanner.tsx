import { useRouter } from 'expo-router';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePhoneRecording } from './PhoneRecordingProvider';
import { durationLabel } from '../recordings/presentation';
import { useTheme, fontFamily } from '../../ui/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export function PhoneRecordingBanner() {
  const { snapshot } = usePhoneRecording();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!snapshot.draft) return null;
  const label =
    snapshot.phase === 'recording'
      ? 'Phone recording'
      : snapshot.phase === 'paused'
        ? 'Phone recording paused'
        : 'Phone recording ready to save';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open recording controls.`}
      onPress={() => router.push('/phone-recording')}
      style={[styles.banner, { backgroundColor: colors.surfaceAlt, paddingTop: 12 + insets.top }]}
    >
      <Text style={[styles.label, { color: colors.accent }]}>
        {label} · {durationLabel(snapshot.seconds)}
      </Text>
      <Text style={{ color: colors.inkSecondary }}>Tap for controls</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  banner: { padding: 12, minHeight: 48 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
});
