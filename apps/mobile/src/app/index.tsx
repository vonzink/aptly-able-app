import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button, Card, PageHeader, Screen } from '../ui/components';
import { fontFamily, useTheme } from '../ui/theme';
import { usePlaudDevice } from '../features/plaud-device/use-plaud-device';
import { useEnrollmentSnapshot } from '../bootstrap/AppProviders';
import { getRecorderNotice } from '../features/plaud-device/recorder-notice';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { snapshot } = usePlaudDevice();
  const enrollment = useEnrollmentSnapshot();
  const needsSetup = !enrollment.operation;
  const recorder = getRecorderNotice(
    snapshot,
    Constants.expoConfig?.extra?.recorderMode === 'mock',
  );
  const recorderConnected = recorder.tone === 'success';
  const noticeInk = recorderConnected ? colors.mintInk : colors.inkSecondary;
  return (
    <Screen>
      <PageHeader
        eyebrow="APTLY ABLE"
        title="Conversations, ready when you are"
        copy="Keep your recordings and transcripts together, ready to revisit."
      />
      <Card style={local.hero}>
        <View style={[local.logoTile, { backgroundColor: '#FFFFFF' }]}>
          <Image
            accessible
            accessibilityLabel="Aptly Able"
            source={require('../../assets/aptly-able-logo.png')}
            resizeMode="contain"
            style={local.logo}
          />
        </View>
        <Text style={[local.heroTitle, { color: colors.ink }]}>
          Bring your conversations with you
        </Text>
        <Text style={[local.heroCopy, { color: colors.inkSecondary }]}>
          Receive audio directly from your paired Plaud into your library. Choose Keep offline in
          app to retain audio on this phone; temporary copies can be cleared to save space.
        </Text>
        <Button
          label={needsSetup ? 'Set up my recorder' : 'Open recordings'}
          onPress={() => router.push(needsSetup ? '/recorder' : '/recordings')}
        />
        {needsSetup && (
          <Button
            variant="text"
            label="Use recordings without a recorder"
            onPress={() => router.push('/recordings')}
          />
        )}
      </Card>
      <View style={local.steps}>
        <Step
          icon="headset-outline"
          title="Listen"
          copy="Play, pause and jump to the moments that matter."
        />
        <Step
          icon="document-text-outline"
          title="Understand"
          copy="Keep notes and transcripts alongside your audio."
        />
      </View>
      <View
        accessibilityLiveRegion="polite"
        style={[
          local.note,
          { backgroundColor: recorderConnected ? colors.mintBg : colors.surfaceAlt },
        ]}
      >
        <Ionicons
          name={recorderConnected ? 'checkmark-circle-outline' : 'radio-outline'}
          size={21}
          color={noticeInk}
        />
        <Text style={[local.noteText, { color: noticeInk }]}>{recorder.message}</Text>
      </View>
      <Button
        variant="text"
        label={recorder.actionLabel}
        onPress={() => router.push('/recorder')}
      />
    </Screen>
  );
}

function Step({
  icon,
  title,
  copy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  copy: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={local.step}>
      <View style={[local.stepIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={local.stepWords}>
        <Text style={[local.stepTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[local.stepCopy, { color: colors.inkSecondary }]}>{copy}</Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  hero: { gap: 14 },
  logoTile: {
    height: 94,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: { width: 174, height: 64 },
  heroTitle: { fontFamily: fontFamily.bold, fontSize: 21 },
  heroCopy: { fontFamily: fontFamily.regular, fontSize: 14.5, lineHeight: 22, marginBottom: 3 },
  steps: { gap: 16, paddingHorizontal: 4 },
  step: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  stepIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepWords: { flex: 1 },
  stepTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  stepCopy: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 20, marginTop: 2 },
  note: { flexDirection: 'row', borderRadius: 12, padding: 14, gap: 11 },
  noteText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 20 },
});
