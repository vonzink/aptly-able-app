import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamily, useTheme } from '../../../ui/theme';
import type { LocalRecording } from '../recording-model';
import { dateLabel, durationLabel, sizeLabel } from '../presentation';

export const RecordingRow = memo(function RecordingRow({
  recording,
  onOpen,
}: {
  recording: LocalRecording;
  onOpen(id: string): void;
}) {
  const { colors } = useTheme();
  const audioStatus =
    recording.audioAvailable === false
      ? recording.source
        ? 'Audio on recorder · connect to load'
        : 'Audio unavailable'
      : recording.source
        ? recording.retention === 'temporary'
          ? 'Temporary audio on this device'
          : 'Kept offline in app'
        : recording.phoneCapture
          ? 'Recorded on this phone'
          : 'Imported audio on this device';
  const transcriptStatus = recording.transcript ? 'Transcript attached' : 'No transcript attached';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recording.title}. ${audioStatus}. ${transcriptStatus}.${recording.notes ? ' Has notes.' : ''}`}
      accessibilityHint="Opens the recording, playback and transcript options"
      onPress={() => onOpen(recording.id)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="musical-notes-outline" size={22} color={colors.accent} />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.ink }]}>
          {recording.title}
        </Text>
        <Text style={[styles.metadata, { color: colors.inkSecondary }]}>
          {dateLabel(recording.importedAt)} · {durationLabel(recording.durationSeconds)} ·{' '}
          {sizeLabel(recording.sizeBytes)}
        </Text>
        <Text style={[styles.status, { color: colors.inkSecondary }]}>{audioStatus}</Text>
        <Text
          style={[
            styles.status,
            { color: recording.transcript ? colors.mintInk : colors.inkSecondary },
          ]}
        >
          {transcriptStatus}
        </Text>
        {recording.notes ? (
          <Text numberOfLines={2} style={[styles.notePreview, { color: colors.inkSecondary }]}>
            Notes: {recording.notes}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
  },
  content: { flex: 1, minWidth: 0 },
  icon: { width: 40, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 23 },
  metadata: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19, marginTop: 4 },
  notePreview: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20, marginTop: 8 },
  status: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 19, marginTop: 4 },
});
