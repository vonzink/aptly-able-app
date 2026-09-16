import { RecordingLocationCard } from '../recording-location/RecordingLocationCard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button, Card, PageHeader, Screen } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { useRecordings, useRecordingsController } from './RecordingsProvider';
import { dateLabel, sizeLabel } from './presentation';
import { usePlaybackSource } from './use-playback-source';
import { RecordingPlayer } from './components/RecordingPlayer';
import { usePlaudSync } from '../plaud-device/PlaudSyncProvider';
import { transferRecovery } from '../plaud-device/transfer-recovery';
import { RecordingNotesCard } from './components/RecordingNotesCard';
import { RecordingDetailsEditor } from './components/RecordingDetailsEditor';
import { TranscriptPanel } from './components/TranscriptPanel';

export default function RecordingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  return <RecordingDetail key={id} id={id} />;
}
function RecordingDetail({ id }: { id: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const state = useRecordings();
  const controller = useRecordingsController();
  const { controller: sync, snapshot: syncState } = usePlaudSync();
  const recovery = transferRecovery(syncState);
  const [receiving, setReceiving] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const recording = state.recordings.find((item) => item.id === id);
  const [focused, setFocused] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removalPending = useRef(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void controller.reload();
      return () => {
        setFocused(false);
        setConfirmRemove(false);
      };
    }, [controller]),
  );
  const source = usePlaybackSource(
    id,
    focused && !!recording && recording.audioAvailable !== false && !removing,
    `${recording?.retention}:${recording?.audioAvailable}:${audioVersion}`,
  );
  async function receive(keep: boolean) {
    if (receiving) return;
    setReceiving(true);
    controller.clearError();
    try {
      const saved =
        keep && recording?.audioAvailable !== false && !source.error
          ? await controller.keepOnPhone(id)
          : await sync.receive(id, keep);
      if (saved) setAudioVersion((value) => value + 1);
    } finally {
      setReceiving(false);
    }
  }
  async function remove() {
    if (removalPending.current) return;
    removalPending.current = true;
    setRemoving(true);
    if (await controller.remove(id)) {
      setConfirmRemove(false);
      router.replace('/recordings');
    } else {
      setRemoving(false);
      setConfirmRemove(false);
    }
    removalPending.current = false;
  }
  if (state.loading && !recording)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Loading recording" color={colors.accent} />
      </Screen>
    );
  if (!recording)
    return (
      <Screen>
        <PageHeader
          title="Recording unavailable"
          copy={state.error ?? 'This recording may have been removed or could not be read.'}
        />
        <Button label="Back to recordings" onPress={() => router.replace('/recordings')} />
      </Screen>
    );
  return (
    <Screen>
      <Button
        label="Back to recordings"
        variant="text"
        onPress={() => router.replace('/recordings')}
      />
      <PageHeader
        title={recording.title}
        copy={`${recording.source ? 'Received from Plaud' : 'Imported'} ${dateLabel(recording.importedAt)} · ${sizeLabel(recording.sizeBytes)}`}
      />
      {state.error ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {state.error}
        </Text>
      ) : null}
      {focused && source.uri ? (
        <RecordingPlayer
          key={source.uri}
          uri={source.uri}
          recording={recording}
          pausedForEditing={editing}
        >
          <RecordingNotesCard
            recording={recording}
            saved={detailsSaved}
            onEdit={() => {
              setDetailsSaved(false);
              setEditing(true);
            }}
          />
        </RecordingPlayer>
      ) : (
        <>
          <Card>
            {recording.audioAvailable === false ? (
              <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                Audio is on your recorder. Connect it and choose Load audio to listen.
              </Text>
            ) : source.error ? (
              <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
                {source.error}
              </Text>
            ) : (
              <ActivityIndicator accessibilityLabel="Opening saved audio" color={colors.accent} />
            )}
          </Card>
          <RecordingNotesCard
            recording={recording}
            saved={detailsSaved}
            onEdit={() => {
              setDetailsSaved(false);
              setEditing(true);
            }}
          />
          <TranscriptPanel recording={recording} />
        </>
      )}
      {recording.source ? (
        <Card style={{ gap: 12 }}>
          <Text style={[styles.label, { color: colors.ink }]}>
            {recording.retention === 'temporary' ? 'Temporary audio' : 'Kept offline in app'}
          </Text>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            {recording.retention === 'temporary'
              ? 'Temporary audio may be cleared to save space. Choose Keep offline in app to retain this copy until you delete it.'
              : 'This copy stays in Aptly Able until you delete it. Removing the app also removes this copy.'}
          </Text>
          {recording.audioAvailable === false || source.error ? (
            <Button
              label="Load audio"
              variant="secondary"
              loading={receiving}
              disabled={syncState.restartRequired}
              onPress={() => void receive(false)}
            />
          ) : null}
          {recording.retention === 'temporary' || recording.audioAvailable === false ? (
            <Button
              label="Keep offline in app"
              loading={receiving || state.busy}
              disabled={
                syncState.restartRequired && (recording.audioAvailable === false || !!source.error)
              }
              onPress={() => void receive(true)}
            />
          ) : null}
          {receiving && syncState.progress !== null ? (
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Receiving · {Math.round(syncState.progress)}%
            </Text>
          ) : null}
          {receiving && syncState.phase === 'saving' ? (
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Saving the recording on this phone…
            </Text>
          ) : null}
          {recovery?.message || syncState.message ? (
            <Text accessibilityRole="alert" style={[styles.copy, { color: colors.inkSecondary }]}>
              {recovery?.message ?? syncState.message}
            </Text>
          ) : null}
          {(recording.audioAvailable === false || source.error) && syncState.phase === 'waiting' ? (
            <Button label="Open recorder" variant="text" onPress={() => router.push('/recorder')} />
          ) : null}
        </Card>
      ) : null}
      <RecordingLocationCard recording={recording} />
      <Text style={[styles.footnote, { color: colors.inkSecondary }]}>
        Original file: {recording.originalName}
        {'\n'}
        {recording.source
          ? 'The Plaud recorder keeps the source file. Aptly Able keeps this phone copy according to the setting above. This release does not upload recorder audio or transcripts to the Aptly Able server.'
          : 'This audio, your notes and any imported transcript are stored on this device.'}
      </Text>
      <Button
        label="Delete from app"
        variant="text"
        onPress={() => {
          controller.clearError();
          setConfirmRemove(true);
        }}
      />
      {editing ? (
        <RecordingDetailsEditor
          recording={recording}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setDetailsSaved(true);
          }}
        />
      ) : null}
      <ConfirmationDialog
        visible={confirmRemove}
        title="Delete from the app?"
        description={`This deletes “${recording.title}”, its Aptly Able audio copy on this phone, and its local transcript, notes and locations. Source files and copies outside the app stay where they are. This release has no Aptly Able server copy to delete.`}
        confirmLabel="Delete recording"
        cancelLabel="Keep recording"
        loading={removing}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      >
        {recording.source ? (
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            The original stays on your recorder. This recording will not automatically return to the
            app.
          </Text>
        ) : null}
      </ConfirmationDialog>
    </Screen>
  );
}
const styles = StyleSheet.create({
  label: { fontFamily: fontFamily.semibold, fontSize: 14 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  footnote: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
