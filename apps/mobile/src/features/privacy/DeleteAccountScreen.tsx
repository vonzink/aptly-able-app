import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  useAccountSession,
  useCreateAccountDeletionClient,
  useEnrollmentController,
} from '../../bootstrap/AppProviders';
import { Button, Card, PageHeader, Screen } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { useRecordingsController } from '../recordings/RecordingsProvider';
import { deletionJournal } from '../../services/deletion-journal';
import { deletionStatusStore } from '../../services/deletion-status';
import { deletionTiming } from './deletion-status-store';
import { ACCOUNT_DELETION_MAX_DAYS } from '@aptly/contracts';
import { deletionRecovery } from '../../services/deletion-recovery';
import { CompanyLinks } from './CompanyLinks';
import {
  removeAccountRecordings,
  submitAccountDeletion,
  recoverAccountDeletion,
  retryAccountLocalCleanup,
  refreshAccountDeletionStatus,
  type DeletionRecord,
} from './account-deletion';

export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const session = useAccountSession();
  const enrollment = useEnrollmentController();
  const createClient = useCreateAccountDeletionClient();
  const library = useRecordingsController();
  const actorId = session.state.session?.identity.user.id ?? null;
  const [record, setRecord] = useState<DeletionRecord | null>(null);
  const [history, setHistory] = useState<DeletionRecord[]>([]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(true);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void loadReceipt();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setPassword('');
    setConfirmation('');
    setConfirming(false);
  }, [actorId]);
  const shownRecord = record && (!actorId || record.actorId === actorId) ? record : null;
  const currentActor = () => session.controller.getSnapshot().session?.identity.user.id ?? null;
  async function loadReceipt() {
    if (active.current) return;
    active.current = true;
    if (mounted.current) {
      setLoadingReceipt(true);
      setError(null);
    }
    try {
      const saved = await deletionJournal.read();
      if (mounted.current) {
        setRecord(saved);
        setHistory(await deletionJournal.list());
      }
      const result = await recoverAccountDeletion({
        createClient,
        recovery: deletionRecovery,
        statusStore: deletionStatusStore,
        journal: deletionJournal,
        currentActor,
        signOut: () => enrollment.signOut(),
        cleanLocal: (id) => removeAccountRecordings(library, id),
        onAccepted: (value) => {
          if (mounted.current) setRecord(value);
        },
      });
      if (mounted.current) {
        setRecoveryPending(false);
        if (result) {
          setRecord(result.record);
          setError(result.warning);
        }
      }
      // A pending receipt survives sign-out. Refresh it when this page opens;
      // network failure must keep the last saved receipt visible.
      if (
        !result &&
        saved?.receipt.status === 'pending' &&
        (!currentActor() || currentActor() === saved.actorId)
      ) {
        try {
          if (await deletionStatusStore.read(saved.receipt.requestId)) {
            const updated = await refreshAccountDeletionStatus({
              record: saved,
              journal: deletionJournal,
              statusStore: deletionStatusStore,
              createClient,
              currentActor,
            });
            if (mounted.current) setRecord(updated);
          }
        } catch {
          if (mounted.current)
            setError(
              'Could not refresh deletion status. Your saved receipt is shown; try again when you are online.',
            );
        }
      }
    } catch {
      if (mounted.current) {
        setRecoveryPending(true);
        setError(
          'An earlier deletion request may still be pending. Check its status when you are online. If still signed in, confirm again to retry the same request. No new deletion was sent during this status check.',
        );
      }
    } finally {
      active.current = false;
      if (mounted.current) setLoadingReceipt(false);
    }
  }
  async function submit() {
    if (active.current || !actorId) return;
    active.current = true;
    setBusy(true);
    setError(null);
    const submittedActor = actorId;
    try {
      const credential = session.controller.getCredential();
      if (!credential) throw new Error('Sign in again before requesting deletion.');
      const result = await submitAccountDeletion({
        client: createClient(credential),
        credential,
        recovery: deletionRecovery,
        statusStore: deletionStatusStore,
        password,
        confirmation,
        actorId: submittedActor,
        currentActor,
        journal: deletionJournal,
        signOut: () => enrollment.signOut(),
        cleanLocal: (id) => removeAccountRecordings(library, id),
        onAccepted: (value) => {
          if (mounted.current) {
            setRecord(value);
            setConfirming(false);
            setPassword('');
            setConfirmation('');
          }
        },
      });
      if (mounted.current && (!currentActor() || currentActor() === submittedActor))
        setError(result.warning);
      if (mounted.current) setHistory(await deletionJournal.list());
    } catch (failure) {
      if (mounted.current)
        setRecoveryPending(Boolean(await deletionRecovery.read().catch(() => true)));
      if (mounted.current && currentActor() === submittedActor)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The deletion request could not be completed. Try again.',
        );
    } finally {
      active.current = false;
      if (mounted.current) {
        setBusy(false);
        setConfirming(false);
      }
    }
  }
  async function retryLocal() {
    if (active.current || !shownRecord) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await retryAccountLocalCleanup({
        record: shownRecord,
        journal: deletionJournal,
        currentActor,
        signOut: () => enrollment.signOut(),
        cleanLocal: (id) => removeAccountRecordings(library, id),
        onAccepted: (value) => {
          if (mounted.current) setRecord(value);
        },
      });
      if (mounted.current) setRecord(result);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : 'Local cleanup failed. Try again.');
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refreshStatus() {
    if (active.current || !shownRecord) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await refreshAccountDeletionStatus({
        record: shownRecord,
        journal: deletionJournal,
        statusStore: deletionStatusStore,
        createClient,
        currentActor,
      });
      if (mounted.current) {
        setRecord(updated);
        setHistory(await deletionJournal.list());
      }
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to check deletion status. Try again.',
        );
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const timing = shownRecord ? deletionTiming(shownRecord.receipt) : null;
  const visibleHistory = history.filter((item) => !actorId || item.actorId === actorId);
  const copy = [styles.copy, { color: colors.inkSecondary }];
  const input = [
    styles.input,
    { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
  ];
  return (
    <Screen>
      <Button
        label="Back to Settings"
        variant="text"
        disabled={busy}
        onPress={() => router.replace('/settings')}
      />
      <PageHeader
        title="Delete account"
        copy="Request removal of your account and its associated data."
      />
      {error && (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      {recoveryPending && (
        <Button
          label="Check deletion request status"
          loading={loadingReceipt}
          onPress={() => void loadReceipt()}
        />
      )}
      {loadingReceipt && !shownRecord ? (
        <Text style={copy}>Checking for a saved deletion request…</Text>
      ) : shownRecord ? (
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            Deletion {shownRecord.receipt.status === 'complete' ? 'completed' : 'requested'}
          </Text>
          <Text style={copy}>
            {shownRecord.receipt.status === 'complete'
              ? 'The service has confirmed account deletion.'
              : 'Your account is disabled while service data, Plaud and backup cleanup finish. Check status here for completion; you do not need to contact support to complete the request.'}
          </Text>
          <Text selectable style={[styles.reference, { color: colors.ink }]}>
            Reference: {shownRecord.receipt.requestId}
          </Text>
          <Text style={copy}>
            Requested {new Date(shownRecord.receipt.requestedAt).toLocaleDateString()}. This is the
            saved receipt. Use Check deletion status below to retrieve the current status.
          </Text>
          {timing && (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.copy, { color: timing.overdue ? colors.danger : colors.inkSecondary }]}
            >
              {timing.text}
            </Text>
          )}
          {shownRecord.receipt.status === 'pending' && (
            <Button
              label="Check deletion status"
              loading={busy || loadingReceipt}
              onPress={() => void refreshStatus()}
            />
          )}
          <Text style={copy}>
            {shownRecord.localCleanup === 'complete'
              ? 'This account’s readable recorder downloads were removed from this app. Manually imported files, exports and the recorder’s originals remain.'
              : 'Local cleanup still needs to finish. This does not cancel your server deletion request.'}
          </Text>
          {shownRecord.localCleanup === 'pending' && (
            <Button label="Retry local cleanup" loading={busy} onPress={() => void retryLocal()} />
          )}
        </Card>
      ) : actorId && session.state.session?.identity.mode === 'pilot' ? (
        <Card style={styles.card}>
          <Text selectable style={[styles.title, { color: colors.ink }]}>
            {session.state.session.accountEmail ?? 'Your signed-in account'}
          </Text>
          <Text style={copy}>
            This disables your account, signs you out, releases your dashboard assignment and
            requests removal of your server data. Account, Plaud and backup cleanup will complete
            within {ACCOUNT_DELETION_MAX_DAYS} days. You will receive a reference and can check
            completion here without signing in.
          </Text>
          <Text style={copy}>
            Recorder downloads, notes and transcripts belonging to this account will be removed from
            this phone. Manually imported files remain. Export anything you need before continuing.
          </Text>
          <Text style={copy}>
            If possible, stop recording and unpair your device first in Recorder. You can still
            delete your account without the device nearby. Deletion does not erase the recorder or
            stop its physical recording.
          </Text>
          <Text style={copy}>Confirm your password</Text>
          <TextInput
            accessibilityLabel="Confirm your account password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            maxLength={128}
            editable={!busy}
            style={input}
          />
          <Text style={copy}>Type DELETE to confirm</Text>
          <TextInput
            accessibilityLabel="Type DELETE to confirm account deletion"
            autoCapitalize="characters"
            autoCorrect={false}
            value={confirmation}
            onChangeText={setConfirmation}
            maxLength={6}
            editable={!busy}
            style={input}
          />
          <Button
            label="Request account deletion"
            variant="danger"
            loading={busy}
            disabled={!password || confirmation !== 'DELETE'}
            onPress={() => setConfirming(true)}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={copy}>
            Sign in with your email and password to delete your account. If you cannot sign in,
            support can help with your deletion request.
          </Text>
          <Button label="Open sign in" onPress={() => router.push('/enroll')} />
        </Card>
      )}
      {visibleHistory.length > 1 && (
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            Saved deletion requests
          </Text>
          {visibleHistory.map((item) => (
            <Button
              key={item.receipt.requestId}
              variant="text"
              label={`${new Date(item.receipt.requestedAt).toLocaleDateString()} · ${item.receipt.status} · ${item.receipt.requestId.slice(-8)}`}
              disabled={busy}
              onPress={() => {
                setRecord(item);
                setError(null);
              }}
            />
          ))}
        </Card>
      )}
      <Card>
        <CompanyLinks supportOnly />
      </Card>
      <ConfirmationDialog
        visible={confirming}
        title="Delete this account?"
        description="This cannot be undone once cleanup begins. Your recorder’s original files and manually imported or exported files will remain."
        confirmLabel="Delete account"
        loading={busy}
        disabled={confirmation !== 'DELETE' || !password}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { gap: 15 },
  title: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 25 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 23 },
  reference: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 24 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
});
