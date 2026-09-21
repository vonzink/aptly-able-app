import { AudioModule, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  assertPhoneDraft,
  type PhoneRecorderPort,
  type PhoneRecordingDraft,
} from '../features/phone-recording/phone-recording-model';
import { isRecordingId, validateAudioImport } from '../features/recordings/recording-model';

// Unfinished audio and its journal are temporary and excluded from OS backups.
// A successful library save copies the audio before either is removed.
const journal = new Directory(Paths.cache, 'aptly-phone-recording-v1');
let recorder: AudioRecorder | null = null;
let current: PhoneRecordingDraft | null = null;
let subscription: { remove(): void } | null = null;
let seconds = 0;
let finished = false;
let failed = false;
const revoked = new Set<string>();
const revokedActors = new Set<string>();
function draftFile(actorId: string) {
  if (!isRecordingId(actorId)) throw new Error('Invalid recording owner.');
  return new File(journal, `${actorId}.json`);
}
function ownedAudio(draft: PhoneRecordingDraft) {
  assertPhoneDraft(draft);
  const url = new URL(draft.uri);
  const directory = new Directory(Paths.cache, Platform.OS === 'ios' ? 'ExpoAudio' : 'Audio');
  const prefix = decodeURIComponent(new URL(directory.uri + '/').pathname).replace(/\/+$/, '/');
  const path = decodeURIComponent(url.pathname);
  const name = path.slice(prefix.length);
  if (
    url.protocol !== 'file:' ||
    url.host ||
    url.search ||
    url.hash ||
    !path.startsWith(prefix) ||
    !/^recording-[0-9a-f-]+\.m4a$/i.test(name)
  )
    throw new Error('The phone recording is outside its audio folder.');
  return new File(draft.uri);
}
function release() {
  subscription?.remove();
  subscription = null;
  recorder?.release();
  recorder = null;
}
async function readDraft(actorId: string) {
  const file = draftFile(actorId);
  if (!file.exists) return null;
  const value: unknown = JSON.parse(await file.text());
  assertPhoneDraft(value);
  if (value.actorId !== actorId) throw new Error('Recording owner does not match.');
  ownedAudio(value);
  return value;
}
async function stop() {
  if (!recorder) return;
  try {
    seconds = Math.max(seconds, recorder.getStatus().durationMillis / 1000);
  } catch {
    /* A status failure must not prevent stopping the microphone. */
  }
  await recorder.stop();
  finished = true;
  await setAudioModeAsync({
    allowsRecording: false,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
  });
}
export const phoneRecorder: PhoneRecorderPort = {
  available: true,
  async requestPermission() {
    if (AppState.currentState !== 'active')
      throw new Error('Open Aptly Able before starting a recording.');
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const allowed = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (allowed !== PermissionsAndroid.RESULTS.GRANTED)
        throw new Error(
          'Allow notifications in phone settings so the recording controls stay visible when the screen is locked.',
        );
    }
    return true;
  },
  async prepare(draft) {
    if (revokedActors.has(draft.actorId))
      throw new Error('This account is being removed. Recording is unavailable.');
    if (AppState.currentState !== 'active')
      throw new Error('Return to Aptly Able to start recording.');
    if (await readDraft(draft.actorId))
      throw new Error('Save or discard your unfinished recording first.');
    release();
    seconds = 0;
    finished = false;
    failed = false;
    revoked.delete(draft.id);
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    const options = {
      ...RecordingPresets.HIGH_QUALITY,
      ...(Platform.OS === 'ios'
        ? RecordingPresets.HIGH_QUALITY.ios
        : RecordingPresets.HIGH_QUALITY.android),
      directory: 'cache' as const,
      numberOfChannels: 1,
      bitRate: 64000,
      isMeteringEnabled: true,
    };
    try {
      recorder = new AudioModule.AudioRecorder(options);
      subscription = recorder.addListener('recordingStatusUpdate', (status) => {
        finished = status.isFinished;
        failed = status.hasError;
      });
      await recorder.prepareToRecordAsync();
      if (revokedActors.has(draft.actorId))
        throw new Error('This account is being removed. Recording was cancelled.');
      const uri = recorder.uri;
      if (!uri) throw new Error('The microphone did not create an audio file.');
      current = { ...draft, uri };
      ownedAudio(current);
      journal.create({ intermediates: true, idempotent: true });
      const temporary = new File(journal, `${draft.actorId}.pending`);
      if (temporary.exists) temporary.delete();
      temporary.create();
      temporary.write(JSON.stringify(current));
      temporary.move(draftFile(draft.actorId));
      return current;
    } catch (error) {
      // No recording has started yet. Release the audio session and any partial file.
      try {
        await stop();
      } catch {
        /* Preserve the preparation failure. */
      }
      const uri = recorder?.uri;
      release();
      current = null;
      await setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
      }).catch(() => {});
      if (uri) {
        try {
          const file = ownedAudio({ ...draft, uri });
          if (file.exists) file.delete();
        } catch {
          /* Do not touch an unrecognized path. */
        }
      }
      throw error;
    }
  },
  record(duration) {
    if (!recorder || !current || revoked.has(current.id) || revokedActors.has(current.actorId))
      throw new Error('Prepare the microphone before recording.');
    if (AppState.currentState !== 'active')
      throw new Error('Open the app before starting or resuming recording.');
    recorder.record({ forDuration: duration });
  },
  pause() {
    recorder?.pause();
  },
  stop,
  status() {
    const status = recorder?.getStatus();
    seconds = Math.max(seconds, (status?.durationMillis ?? 0) / 1000);
    return {
      recording: status?.isRecording ?? false,
      canRecord: status?.canRecord ?? false,
      durationSeconds: seconds,
      finished,
      error: failed || !!status?.mediaServicesDidReset,
    };
  },
  async audio(draft) {
    if (revoked.has(draft.id) || revokedActors.has(draft.actorId))
      throw new Error('This phone recording was removed.');
    const file = ownedAudio(draft);
    const input = {
      uri: draft.uri,
      name: `Phone-recording-${draft.id}.m4a`,
      sizeBytes: file.exists ? file.size : 0,
      mimeType: 'audio/mp4',
    };
    validateAudioImport(input);
    return { ...draft, input, durationSeconds: current?.id === draft.id ? seconds : 0 };
  },
  recover: readDraft,
  async discard(draft) {
    const file = ownedAudio(draft);
    if (current?.id === draft.id) {
      await stop();
      release();
      current = null;
    }
    if (file.exists) file.delete();
    const stored = await readDraft(draft.actorId);
    if (stored?.id === draft.id) draftFile(draft.actorId).delete();
  },
  async clearActor(actorId) {
    revokedActors.add(actorId);
    if (current?.actorId === actorId) {
      revoked.add(current.id);
      await stop();
    }
    const draft = await readDraft(actorId);
    if (draft) {
      revoked.add(draft.id);
      await this.discard(draft);
    }
  },
};
