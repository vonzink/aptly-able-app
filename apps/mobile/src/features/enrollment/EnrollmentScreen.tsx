import { RecorderPhoto } from '../recorder/RecorderPhoto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Screen } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { LocalAccessCard } from '../session/LocalAccessCard';
import { parseEnrollmentInput } from './enrollment-link';
import { useEnrollmentController, useEnrollmentSnapshot } from './use-enrollment';

export default function EnrollmentScreen() {
  const router = useRouter();
  const controller = useEnrollmentController();
  const state = useEnrollmentSnapshot();
  const { colors } = useTheme();
  const [manual, setManual] = useState('');
  const [inputMessage, setInputMessage] = useState<string | null>(null);
  const needsSignIn = state.phase === 'signed-out' || state.phase === 'signing-in';

  const acceptManual = () => {
    const parsed = parseEnrollmentInput(manual);
    if (!parsed.ok) {
      setInputMessage(
        parsed.reason === 'query-token'
          ? 'Invitation tokens in query strings are not accepted.'
          : 'Enter a valid invitation link or code.',
      );
      return;
    }
    setInputMessage(null);
    setManual('');
    controller.receiveInvitation(parsed.token);
    if (controller.getSnapshot().actorId) void controller.resolveInvitation();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.orangeInk }]}>
          {needsSignIn ? 'APTLY ABLE' : 'RECORDER ENROLLMENT'}
        </Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {needsSignIn ? 'Welcome' : 'Set up your assigned recorder'}
        </Text>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {needsSignIn
            ? 'Sign in to access your recorder and recordings.'
            : 'Accept your recorder invitation, then connect with Bluetooth.'}
        </Text>
      </View>

      {needsSignIn ? (
        <>
          <LocalAccessCard
            loading={state.phase === 'signing-in'}
            message={state.message}
            onSubmit={(code, email, expiresAt) => void controller.signIn(code, email, expiresAt)}
          />
          {state.hasInvitation ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.cardCopy, { color: colors.mintInk }]}
            >
              Invitation received. Sign in above to continue setting up your recorder.
            </Text>
          ) : (
            <InvitationEntry
              value={manual}
              message={inputMessage}
              onChange={setManual}
              onSubmit={acceptManual}
            />
          )}
        </>
      ) : null}

      {state.phase === 'needs-invitation' ? (
        <>
          <StatusCard
            icon="qr-code-outline"
            title="Invitation needed"
            copy={state.message ?? 'Scan your invitation again or enter it below.'}
          />
          <InvitationEntry
            value={manual}
            message={inputMessage}
            onChange={setManual}
            onSubmit={acceptManual}
          />
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </>
      ) : null}

      {state.phase === 'resolving' ? (
        <StatusCard
          icon="hourglass-outline"
          title="Checking invitation"
          copy="Confirming this recorder is assigned to your account…"
        />
      ) : null}

      {state.phase === 'ready' && state.preview ? (
        <Card style={styles.card}>
          <View
            style={{ alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 14 }}
          >
            <RecorderPhoto model={state.preview.recorder.model} size={156} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>
            Your Plaud recorder is ready to set up
          </Text>
          <Text style={[styles.model, { color: colors.ink }]}>
            {modelName(state.preview.recorder.model)} · •••• {state.preview.recorder.serialSuffix}
          </Text>
          <Text style={[styles.cardCopy, { color: colors.inkSecondary }]}>
            Continue to save this assignment, then connect the recorder with Bluetooth in the
            installed phone app.
          </Text>
          <Button label="Continue setup" onPress={() => void controller.claim()} />
          <Button
            variant="text"
            label="Use a different invitation"
            onPress={() => controller.receiveInvitation('')}
          />
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </Card>
      ) : null}

      {state.phase === 'claiming' ? (
        <StatusCard
          icon="cloud-upload-outline"
          title="Saving enrollment"
          copy="Keep this screen open while your enrollment is saved."
        />
      ) : null}

      {state.phase === 'saved' ? (
        <Card style={styles.card}>
          <View style={[styles.icon, { backgroundColor: colors.mintBg }]}>
            <Ionicons name="checkmark-circle-outline" size={30} color={colors.mintInk} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Enrollment saved</Text>
          <Text style={[styles.cardCopy, { color: colors.inkSecondary }]}>
            Your assignment is saved. Open Recorder in the phone app to finish connecting with
            Bluetooth.
          </Text>
          <Button label="Open Recorder" onPress={() => router.push('/recorder')} />
          <Button
            variant="secondary"
            label="Refresh status"
            onPress={() => void controller.refresh()}
          />
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </Card>
      ) : null}

      {state.phase === 'revoked' ? (
        <>
          <StatusCard
            icon="alert-circle-outline"
            title="Enrollment no longer available"
            copy="This setup was revoked or the assignment changed. Ask your administrator for a new invitation."
            danger
          />
          <Button
            variant="secondary"
            label="Enter a new invitation"
            onPress={() => void controller.startNewInvitation()}
          />
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </>
      ) : null}

      {state.phase === 'recovery-error' ? (
        <>
          <StatusCard
            icon="cloud-offline-outline"
            title="Could not restore enrollment"
            copy={state.message ?? 'Check your connection and try again.'}
            danger
          />
          <Button
            label="Retry enrollment recovery"
            onPress={() => void controller.retryRecovery()}
          />
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </>
      ) : null}

      {state.phase === 'error' || state.phase === 'storage-error' ? (
        <>
          <StatusCard
            icon="alert-circle-outline"
            title={
              state.phase === 'storage-error'
                ? 'Secure recovery unavailable'
                : 'Enrollment needs attention'
            }
            copy={state.message ?? 'Try again.'}
            danger
          />
          {state.operation && state.phase === 'error' ? (
            <Button label="Retry status refresh" onPress={() => void controller.refresh()} />
          ) : null}
          {!state.operation && state.preview && state.phase === 'error' ? (
            <Button label="Try Continue setup again" onPress={() => void controller.claim()} />
          ) : null}
          {!state.operation ? (
            <InvitationEntry
              value={manual}
              message={inputMessage}
              onChange={setManual}
              onSubmit={acceptManual}
            />
          ) : null}
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        </>
      ) : null}
    </Screen>
  );
}

function InvitationEntry({
  value,
  message,
  onChange,
  onSubmit,
}: {
  value: string;
  message: string | null;
  onChange(value: string): void;
  onSubmit(): void;
}) {
  const { colors } = useTheme();
  const [workspaceError, setWorkspaceError] = useState(false);
  async function openWorkspace() {
    setWorkspaceError(false);
    try {
      await Linking.openURL('https://plaud.aptlyable.info/');
    } catch {
      setWorkspaceError(true);
    }
  }
  return (
    <Card style={styles.entry}>
      <Text style={[styles.entryTitle, { color: colors.ink }]}>Invitation</Text>
      <Text style={[styles.cardCopy, { color: colors.inkSecondary }]}>
        Open your setup link on this phone, scan a QR shown on another screen, or paste the link
        below. Need an invitation? Add your recorder in the website’s recorder workspace; a computer
        is optional.
      </Text>
      <Button
        variant="text"
        label="Get a setup link on this phone"
        onPress={() => void openWorkspace()}
      />
      {workspaceError && (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          Open plaud.aptlyable.info in your phone’s browser, sign in, then add your recorder and
          create its setup link.
        </Text>
      )}
      <TextInput
        accessibilityLabel="Invitation link or code"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Invitation link or code"
        placeholderTextColor={colors.inkMuted}
        secureTextEntry
        style={[
          styles.input,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
        ]}
        value={value}
      />
      {message ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {message}
        </Text>
      ) : null}
      <Button variant="secondary" label="Use invitation" onPress={onSubmit} />
    </Card>
  );
}

function StatusCard({
  icon,
  title,
  copy,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  copy: string;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <View
        style={[styles.icon, { backgroundColor: danger ? colors.dangerBg : colors.surfaceAlt }]}
      >
        <Ionicons name={icon} size={28} color={danger ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text>
      <Text
        accessibilityRole={danger ? 'alert' : undefined}
        style={[styles.cardCopy, { color: colors.inkSecondary }]}
      >
        {copy}
      </Text>
    </Card>
  );
}

function modelName(model: 'notepro' | 'notepins') {
  return model === 'notepro' ? 'Plaud Note Pro' : 'Plaud NotePin S';
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 4 },
  eyebrow: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 2 },
  title: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 35 },
  copy: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 23 },
  card: { gap: 14 },
  entry: { gap: 12 },
  entryTitle: { fontFamily: fontFamily.bold, fontSize: 18 },
  icon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 20 },
  cardCopy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  model: { fontFamily: fontFamily.semibold, fontSize: 16 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  error: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 20 },
});
