import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../../ui/components';
import { fontFamily, useTheme } from '../../../ui/theme';
import { pickTranscript } from '../../../services/recording-picker';
import { pickerFailureMessage } from '../../../services/recording-picker-errors';
import type { LocalRecording } from '../recording-model';
import { useRecordingsController } from '../RecordingsProvider';
import { durationLabel } from '../presentation';
import { GenerationPanel } from '../../transcription/GenerationPanel';

export function TranscriptPanel({
  recording,
  currentTime = 0,
  onSeek,
}: {
  recording: LocalRecording;
  currentTime?: number;
  onSeek?: ((seconds: number) => void) | undefined;
}) {
  const { colors } = useTheme();
  const controller = useRecordingsController();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  async function attach() {
    if (locked.current) return;
    locked.current = true;
    setPicking(true);
    setError(null);
    try {
      const file = await pickTranscript();
      if (file) {
        await controller.attachTranscript(recording.id, file.name, file.text);
        if (file.cleanupWarning) setError(file.cleanupWarning);
      }
    } catch (error) {
      setError(
        pickerFailureMessage(
          error,
          'The transcript could not be opened. Choose a TXT, SRT or VTT file smaller than 2 MB.',
        ),
      );
    } finally {
      locked.current = false;
      setPicking(false);
    }
  }
  const transcript = recording.transcript;
  return (
    <>
      <GenerationPanel recording={recording} currentTime={currentTime} onSeek={onSeek} />
      <Card style={styles.panel}>
        <View style={styles.heading}>
          <Ionicons name="document-text-outline" color={colors.accent} size={22} />
          <Text style={[styles.title, { color: colors.ink }]}>Transcript file (optional)</Text>
        </View>
        {transcript ? (
          <>
            <Text style={[styles.caption, { color: colors.inkSecondary }]}>
              Imported from {transcript.fileName}
              {transcript.segments.length ? ' · Tap a timestamp to listen' : ''}
            </Text>
            {transcript.segments.length ? (
              transcript.segments.map((segment, index) => {
                const selected =
                  currentTime >= segment.startSeconds && currentTime < segment.endSeconds;
                return (
                  <View
                    key={`${index}-${segment.startSeconds}`}
                    style={[
                      styles.segment,
                      selected ? { backgroundColor: colors.surfaceAlt } : null,
                    ]}
                  >
                    <View style={styles.segmentHeading}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Play from ${durationLabel(segment.startSeconds)}`}
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
                );
              })
            ) : (
              <Text selectable style={[styles.body, { color: colors.ink }]}>
                {transcript.text}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.body, { color: colors.inkSecondary }]}>
            You can also attach an existing transcript file. Timed transcripts let you jump to a
            moment in the recording.
          </Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        <Button
          label={transcript ? 'Replace transcript file' : 'Attach transcript file'}
          variant="secondary"
          loading={picking}
          onPress={() => void attach()}
        />
        {!transcript ? (
          <Text style={[styles.caption, { color: colors.inkSecondary }]}>
            TXT, SRT or VTT. Imported transcripts stay on this device.
          </Text>
        ) : null}
      </Card>
    </>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.bold, fontSize: 18 },
  caption: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 18 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 23 },
  segment: { gap: 4, padding: 10, borderRadius: 10 },
  segmentHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timestamp: { paddingVertical: 7, minWidth: 45 },
  time: { fontFamily: fontFamily.semibold, fontSize: 12 },
  speaker: { fontFamily: fontFamily.semibold, fontSize: 12 },
});
