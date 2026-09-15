import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, PageHeader, Screen, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecordingStorageCard } from '../recordings/components/RecordingStorageCard';
import { SettingsDiagnostics } from './SettingsDiagnostics';
import { isStoreRelease } from '../../services/release-profile';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <PageHeader
        title="Settings"
        copy="Manage your recorder setup and recordings on this phone."
      />
      <SettingsDiagnostics />
      <SectionLabel>STORAGE</SectionLabel>
      <RecordingStorageCard />
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
      <SectionLabel>PRIVACY & HELP</SectionLabel>
      <Card style={local.enrollment}>
        <Button
          label="Privacy & your recordings"
          variant="secondary"
          onPress={() => router.push('/privacy')}
        />
        <Button
          label="Help & support"
          variant="secondary"
          onPress={() => router.push('/support')}
        />
        <Button
          label="Delete account"
          variant="text"
          onPress={() => router.push('/delete-account')}
        />
      </Card>
      {!isStoreRelease && (
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
      )}
    </Screen>
  );
}
const local = StyleSheet.create({
  scope: { borderRadius: 14, padding: 17 },
  scopeTitle: { fontFamily: fontFamily.bold, fontSize: 16 },
  scopeCopy: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 21, marginTop: 7 },
  enrollment: { gap: 13 },
});
