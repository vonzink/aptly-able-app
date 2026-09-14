import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, PageHeader, Screen, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecordingStorageCard } from '../recordings/components/RecordingStorageCard';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <PageHeader
        title="Settings"
        copy="Manage your recorder setup and recordings on this phone."
      />
      <SectionLabel>STORAGE</SectionLabel>
      <RecordingStorageCard />
      <SectionLabel>APP STATUS</SectionLabel>
      <Card style={local.list}>
        <Row icon="bluetooth-outline" label="Recorder connection" value="Phone app" />
        <Divider />
        <Row icon="cloud-upload-outline" label="Transcription" value="Open a recording" />
        <Divider />
        <Row icon="folder-outline" label="Recording storage" value="This device" />
      </Card>
      <SectionLabel>RECORDER SETUP</SectionLabel>
      <Card style={local.enrollment}>
        <Text style={[local.scopeTitle, { color: colors.ink }]}>Assigned recorder invitation</Text>
        <Text style={[local.scopeCopy, { color: colors.inkSecondary }]}>
          Claim your assigned recorder invitation, then open Recorder in the installed phone app to
          connect with Bluetooth.
        </Text>
        <Button
          variant="secondary"
          label="Open enrollment"
          onPress={() => router.push('/enroll')}
        />
      </Card>
      <View style={[local.scope, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[local.scopeTitle, { color: colors.ink }]}>What works today</Text>
        <Text style={[local.scopeCopy, { color: colors.inkSecondary }]}>
          Paired Plaud recorders transfer audio while the phone app is open. Audio uses a limited
          temporary cache; choose Keep offline in app to retain a copy. You can also import other
          audio and transcripts. Transcription for imported audio requires a configured server.
          Automatic Plaud transcripts and cloud backup are not connected yet. Removing the app or
          clearing browser data removes this local library.
        </Text>
      </View>
      <Text style={[local.version, { color: colors.inkMuted }]}>
        Aptly Able {Constants.expoConfig?.version ?? '0.1.0'} · Recordings on this device
      </Text>
    </Screen>
  );
}
function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={local.row}>
      <Ionicons name={icon} color={colors.accent} size={22} />
      <Text style={[local.label, { color: colors.ink }]}>{label}</Text>
      <Text style={[local.value, { color: colors.inkSecondary }]}>{value}</Text>
    </View>
  );
}
function Divider() {
  const { colors } = useTheme();
  return <View style={[local.divider, { backgroundColor: colors.line }]} />;
}
const local = StyleSheet.create({
  list: { paddingVertical: 2, paddingHorizontal: 16 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14.5 },
  value: { fontFamily: fontFamily.regular, fontSize: 13.5 },
  divider: { height: 1, marginLeft: 34 },
  scope: { borderRadius: 14, padding: 17 },
  scopeTitle: { fontFamily: fontFamily.bold, fontSize: 16 },
  scopeCopy: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 21, marginTop: 7 },
  version: { fontFamily: fontFamily.regular, fontSize: 11.5, textAlign: 'center', marginTop: 4 },
  enrollment: { gap: 13 },
});
