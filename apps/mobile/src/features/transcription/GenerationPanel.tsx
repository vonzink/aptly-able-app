import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeneratedTranscript, ProcessingStatus } from '@aptly/contracts';
import {
  useEnrollmentController,
  useEnrollmentSnapshot,
  useTranscriptionClient,
} from '../../bootstrap/AppProviders';
import { recordingStore } from '../../services/recordings/recording-store';
import { prepareRecordingUpload } from '../../services/recording-upload';
import { Button, Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import type { LocalRecording } from '../recordings/recording-model';
import { durationLabel } from '../recordings/presentation';
import { LocalAccessCard } from '../session/LocalAccessCard';
import { createTranscriptionController, isProcessing } from './transcription-controller';
import { recordingServer } from '../../services/recording-server';
import { isStoreRelease } from '../../services/release-profile';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import {
  canBeginConsentedUpload,
  createUploadConsentRequest,
  type UploadConsentRequest,
} from './generation-consent';

const statusLabels: Record<ProcessingStatus, string> = {
  awaiting_upload: 'Ready to upload your saved audio.',
  queued: 'Audio uploaded. Waiting to start transcription…',
  uploading: 'Sending the audio to Plaud…',
  submitting: 'Starting your transcription…',
  transcribing: 'Plaud is transcribing your recording…',
  complete: 'Generated with Plaud · Saved on the server',
  failed: 'The transcription could not be completed. You can try again.',
  submission_uncertain: 'We could not confirm whether Plaud accepted the transcription request.',
};

type GenerationPanelProps = {
  recording: LocalRecording;
  currentTime: number;
  onSeek?: ((seconds: number) => void) | undefined;
};

export function GenerationPanel(props: GenerationPanelProps) {
  // Cloud generation stays outside the first store release until its full
  // upload, retention, and deletion path is verified as a release feature.
  if (isStoreRelease) return null;
  const { colors } = useTheme();
  if (props.recording.source)
    return (
      <Card style={styles.panel}>
        <View style={styles.heading}>
          <Ionicons name="document-text-outline" color={colors.accent} size={22} />
          <Text style={[styles.title, { color: colors.ink }]}>Automatic transcript</Text>
        </View>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {recordingServer.configured
            ? 'Waiting for this recording to be processed by the server.'
            : props.recording.audioAvailable === false
              ? 'Audio is on your recorder. Automatic transcription is waiting for the Aptly Able server integration.'
              : 'Automatic transcription is waiting for the Aptly Able server integration.'}
        </Text>
      </Card>
    );
  return <ManualGenerationPanel {...props} />;
}

function ManualGenerationPanel({ recording, currentTime, onSeek }: GenerationPanelProps) {
  const { colors } = useTheme();
  const client = useTranscriptionClient();
  const enrollment = useEnrollmentController();
  const session = useEnrollmentSnapshot();
  const { id, title, originalName, sizeBytes } = recording;
  const controller = useMemo(
    () =>
      createTranscriptionController({
        client,
        // Metadata changes must not replace the controller and cancel its active request.
        recording: { id, title: originalName, originalName, sizeBytes },
        openAudio: recordingStore.openAudio,
        prepareAudio: prepareRecordingUpload,
        onUnauthorized: () => {
          void enrollment.signOut();
        },
      }),
    [client, enrollment, id, originalName, sizeBytes],
  );
  useEffect(() => controller.setTitle(title), [controller, title]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [uploadConsent, setUploadConsent] = useState<{
    request: UploadConsentRequest;
    action: 'generate' | 'retry' | 'duplicate-retry';
  } | null>(null);
  const [viewSaved, setViewSaved] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void controller.activate(session.actorId);
      return () => controller.deactivate();
    }, [controller, session.actorId]),
  );
  const serverRecord = state.actorId === session.actorId ? state.record : null;
  useEffect(() => {
    setConfirmRetry(false);
    setUploadConsent(null);
  }, [id, session.actorId, serverRecord?.status]);
  const requestUploadConsent = (action: 'generate' | 'retry' | 'duplicate-retry') => {
    if (!session.actorId) return;
    setUploadConsent({
      request: createUploadConsentRequest({ actorId: session.actorId, recordingId: id }),
      action,
    });
  };
  const confirmUpload = () => {
    const pending = uploadConsent;
    setUploadConsent(null);
    const currentActorId = enrollment.getSnapshot().actorId;
    if (
      !pending ||
      !canBeginConsentedUpload(pending.request, { actorId: currentActorId, recordingId: id })
    )
      return;
    if (pending.action === 'generate') void controller.generate();
    else void controller.retry(pending.action === 'duplicate-retry');
  };
  const capabilities = state.capabilities;
  const processing = isProcessing(serverRecord?.status);
  const canGenerate = !serverRecord || serverRecord.status === 'awaiting_upload';
  return (
    <Card style={styles.panel}>
      <View style={styles.heading}>
        <Ionicons name="sparkles-outline" color={colors.accent} size={22} />
        <Text style={[styles.title, { color: colors.ink }]}>Generated transcript</Text>
      </View>
      {!capabilities && state.busy ? (
        <View style={styles.progress}>
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="Checking transcription availability"
          />
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Checking transcription availability…
          </Text>
        </View>
      ) : null}
      {capabilities && !capabilities.available ? (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {capabilities.reason === 'not_configured'
            ? 'Automatic transcription is not set up on this server yet. You can still add an exported transcript below.'
            : 'Audio uploads are temporarily unavailable. Try again later, or add an exported transcript below.'}
        </Text>
      ) : null}
      {capabilities && !capabilities.available && !session.actorId && !viewSaved ? (
        <Button
          label="View saved transcript"
          variant="secondary"
          onPress={() => setViewSaved(true)}
        />
      ) : null}
      {(capabilities?.available || viewSaved) && !session.actorId ? (
        <>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            {capabilities?.available
              ? 'Sign in to upload this recording and generate a transcript with Plaud.'
              : 'Sign in to view an existing generated transcript for this recording.'}
          </Text>
          <LocalAccessCard
            loading={session.phase === 'signing-in'}
            message={session.phase === 'signed-out' ? session.message : null}
            onSubmit={(code) => {
              void enrollment.signIn(code);
            }}
          />
        </>
      ) : null}
      {serverRecord ? (
        <>
          <View style={styles.progress}>
            {processing ? (
              <ActivityIndicator
                color={colors.accent}
                accessibilityLabel="Transcription in progress"
              />
            ) : null}
            <Text style={[styles.copy, styles.flex, { color: colors.inkSecondary }]}>
              {statusLabels[serverRecord.status]}
            </Text>
          </View>
          {processing ? (
            <Text style={[styles.caption, { color: colors.inkSecondary }]}>
              You can leave this screen. Processing continues on the server; reopen the recording to
              check its progress.
            </Text>
          ) : null}
          {serverRecord.transcript ? (
            <>
              <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                AI transcripts can contain mistakes. Check names, numbers and speaker labels against
                the audio.
              </Text>
              <GeneratedTranscriptText
                transcript={serverRecord.transcript}
                currentTime={currentTime}
                onSeek={onSeek}
              />
            </>
          ) : null}
        </>
      ) : null}
      {capabilities?.available && session.actorId && canGenerate ? (
        <>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Manual cloud transcription sends this recording to Aptly Able and Plaud. Review and
            approve the disclosure before each upload.
          </Text>
          <Button
            label={serverRecord ? 'Upload audio and generate transcript' : 'Generate transcript'}
            loading={!!state.busy}
            onPress={() => {
              requestUploadConsent('generate');
            }}
          />
          {state.busy === 'uploading' ? (
            <Text style={[styles.caption, { color: colors.inkSecondary }]}>
              Uploading audio… Keep this screen open until the upload finishes.
            </Text>
          ) : null}
        </>
      ) : null}
      {capabilities?.available && serverRecord?.status === 'failed' ? (
        <Button
          label="Retry transcription"
          loading={!!state.busy}
          onPress={() => {
            requestUploadConsent('retry');
          }}
        />
      ) : null}
      {capabilities?.available && serverRecord?.status === 'submission_uncertain' ? (
        confirmRetry ? (
          <View style={[styles.confirmation, { borderColor: colors.line }]}>
            <Text style={[styles.copy, { color: colors.ink }]}>
              Plaud may already be processing the previous request. A new request can create a
              duplicate transcript and may use additional transcription credit.
            </Text>
            <Button
              label="Start a new request anyway"
              loading={!!state.busy}
              onPress={() => {
                setConfirmRetry(false);
                requestUploadConsent('duplicate-retry');
              }}
            />
            <Button
              label="Keep current request"
              variant="text"
              onPress={() => setConfirmRetry(false)}
            />
          </View>
        ) : (
          <Button
            label="Start another transcription request"
            variant="secondary"
            loading={!!state.busy}
            onPress={() => setConfirmRetry(true)}
          />
        )
      ) : null}
      {state.error ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
          {state.error}
        </Text>
      ) : null}
      {state.error || (capabilities && !capabilities.available) ? (
        <Button
          label="Check transcription status"
          variant="secondary"
          loading={!!state.busy}
          onPress={() => {
            void controller.refresh();
          }}
        />
      ) : null}
      {session.actorId ? (
        <Button
          label="Sign out"
          variant="text"
          onPress={() => {
            void enrollment.signOut();
          }}
        />
      ) : null}
      <ConfirmationDialog
        visible={uploadConsent !== null}
        title="Send audio for transcription?"
        description="If you continue, Aptly Able uploads this recording to its server and sends it to Plaud for AI transcription and speaker labeling. Audio, job data, and the generated transcript may remain with Aptly Able and Plaud until their deletion processes remove them. Review retention and deletion details under Privacy & your recordings in Settings. Declining keeps your local audio available in Aptly Able."
        confirmLabel="Agree and send audio"
        cancelLabel="Keep audio on this phone"
        loading={!!state.busy}
        onConfirm={confirmUpload}
        onCancel={() => setUploadConsent(null)}
      >
        {uploadConsent?.action === 'duplicate-retry' ? (
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Plaud may already be processing the earlier request. Continuing may create a duplicate
            transcript and use additional credit.
          </Text>
        ) : null}
      </ConfirmationDialog>
    </Card>
  );
}

function GeneratedTranscriptText({
  transcript,
  currentTime,
  onSeek,
}: {
  transcript: GeneratedTranscript;
  currentTime: number;
  onSeek?: ((seconds: number) => void) | undefined;
}) {
  const { colors } = useTheme();
  if (!transcript.segments.length)
    return (
      <Text selectable style={[styles.body, { color: colors.ink }]}>
        {transcript.text || 'No speech was detected in this recording.'}
      </Text>
    );
  return (
    <View style={styles.segments}>
      <Text style={[styles.caption, { color: colors.inkSecondary }]}>
        Tap a timestamp to listen.
      </Text>
      {transcript.segments.map((segment, index) => (
        <View
          key={`${index}-${segment.startSeconds}`}
          style={[
            styles.segment,
            currentTime >= segment.startSeconds && currentTime < segment.endSeconds
              ? { backgroundColor: colors.surfaceAlt }
              : null,
          ]}
        >
          <View style={styles.segmentHeading}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play generated transcript from ${durationLabel(segment.startSeconds)}`}
              disabled={!onSeek}
              onPress={() => onSeek?.(segment.startSeconds)}
              style={styles.timestamp}
            >
              <Text style={[styles.time, { color: colors.accent }]}>
                {durationLabel(segment.startSeconds)}
              </Text>
            </Pressable>
            {segment.speakerId ? (
              <Text style={[styles.speaker, { color: colors.inkSecondary }]}>
                {segment.speakerId}
              </Text>
            ) : null}
          </View>
          <Text selectable style={[styles.body, { color: colors.ink }]}>
            {segment.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.bold, fontSize: 18, flexShrink: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 18 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 23 },
  confirmation: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  segments: { gap: 4 },
  segment: { gap: 4, padding: 10, borderRadius: 10 },
  segmentHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timestamp: { paddingVertical: 7, minWidth: 45 },
  time: { fontFamily: fontFamily.semibold, fontSize: 12 },
  speaker: { fontFamily: fontFamily.semibold, fontSize: 12 },
});
