import Ionicons from '@expo/vector-icons/Ionicons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaControl } from '../../../ui/MediaControl';
import { Card } from '../../../ui/components';
import { fontFamily, useTheme } from '../../../ui/theme';
import type { LocalRecording } from '../recording-model';
import { useRecordingsController } from '../RecordingsProvider';
import { durationLabel } from '../presentation';
import { TranscriptPanel } from './TranscriptPanel';
import { PlaybackSlider } from './PlaybackSlider';

export function RecordingPlayer({
  uri,
  recording,
  children,
  pausedForEditing = false,
}: {
  uri: string;
  recording: LocalRecording;
  children?: ReactNode;
  pausedForEditing?: boolean;
}) {
  const { colors } = useTheme();
  const controller = useRecordingsController();
  const player = useAudioPlayer({ uri }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const position = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  useEffect(() => {
    if (!pausedForEditing) return;
    try {
      player.pause();
    } catch {
      setError('Pause playback before dictating a note.');
    }
  }, [pausedForEditing, player]);
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
    }).catch(() =>
      setError('Audio playback could not be prepared. Reopen this recording to try again.'),
    );
  }, []);
  useEffect(() => {
    if (status.isLoaded && duration > 0 && recording.durationSeconds !== duration)
      void controller.setDuration(recording.id, duration);
  }, [controller, recording.id, recording.durationSeconds, duration, status.isLoaded]);
  async function seek(seconds: number, play = false) {
    if (!status.isLoaded) return;
    setError(null);
    try {
      await player.seekTo(Math.max(0, Math.min(duration, seconds)));
      if (play) player.play();
    } catch {
      setError('Playback was interrupted. Try again.');
    }
  }
  async function toggle() {
    setError(null);
    try {
      if (status.playing) player.pause();
      else {
        if (status.didJustFinish || (duration > 0 && position >= duration - 0.05))
          await player.seekTo(0);
        player.play();
      }
    } catch {
      setError('This audio could not be played. Try another MP3, WAV or M4A file.');
    }
  }
  const failed = !!status.error || status.playbackState === 'error';
  return (
    <>
      <Card style={styles.panel}>
        <View style={styles.head}>
          <View style={[styles.headIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="headset-outline" size={24} color={colors.accent} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.ink }]}>Listen back</Text>
            <Text style={[styles.caption, { color: colors.inkSecondary }]}>
              {status.playing ? 'Playing your recording' : 'Ready when you are'}
            </Text>
          </View>
        </View>
        <PlaybackSlider
          duration={duration}
          position={position}
          enabled={status.isLoaded && !failed}
          onSeek={(seconds) => void seek(seconds)}
        />
        <View style={styles.times}>
          <Text style={[styles.time, { color: colors.inkSecondary }]}>
            {durationLabel(position)}
          </Text>
          <Text style={[styles.time, { color: colors.inkSecondary }]}>
            {durationLabel(duration || recording.durationSeconds)}
          </Text>
        </View>
        <View style={styles.controls}>
          <MediaControl
            icon="play-back"
            label="Back 15 sec"
            disabled={!status.isLoaded || failed}
            onPress={() => void seek(position - 15)}
          />
          <MediaControl
            icon={status.playing ? 'pause' : 'play'}
            label={status.playing ? 'Pause' : 'Play'}
            prominent
            disabled={!status.isLoaded || failed}
            loading={!status.isLoaded && !failed}
            onPress={() => void toggle()}
          />
          <MediaControl
            icon="play-forward"
            label="Ahead 30 sec"
            disabled={!status.isLoaded || failed}
            onPress={() => void seek(position + 30)}
          />
        </View>
        <Text style={[styles.speedLabel, { color: colors.inkSecondary }]}>Playback speed</Text>
        <View style={styles.speeds}>
          {[1, 1.5, 2].map((speed) => (
            <Pressable
              key={speed}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${speed} times`}
              accessibilityState={{
                selected: rate === speed,
                disabled: !status.isLoaded || failed,
              }}
              disabled={!status.isLoaded || failed}
              onPress={() => {
                try {
                  player.setPlaybackRate(speed);
                  setRate(speed);
                } catch {
                  setError('Playback speed is unavailable for this file.');
                }
              }}
              style={({ pressed }) => [
                styles.speed,
                {
                  backgroundColor: rate === speed ? colors.surfaceAlt : 'transparent',
                  borderColor: rate === speed ? colors.accent : colors.line,
                  opacity: !status.isLoaded || failed ? 0.45 : pressed ? 0.65 : 1,
                },
              ]}
            >
              <Text style={[styles.rate, { color: colors.accent }]}>{speed}×</Text>
            </Pressable>
          ))}
        </View>
        {failed || error ? (
          <Text accessibilityRole="alert" style={[styles.caption, { color: colors.danger }]}>
            {error ?? 'This audio format could not be played. Try an MP3, WAV or M4A export.'}
          </Text>
        ) : null}
      </Card>
      {children}
      <TranscriptPanel
        recording={recording}
        currentTime={position}
        onSeek={status.isLoaded ? (seconds) => void seek(seconds, true) : undefined}
      />
    </>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 12 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 8 },
  headIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 18 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -9 },
  time: { fontFamily: fontFamily.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  speeds: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  speedLabel: { fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center' },
  speed: {
    minWidth: 64,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rate: { fontFamily: fontFamily.semibold, fontSize: 14 },
});
