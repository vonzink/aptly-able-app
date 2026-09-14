import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../../ui/components';
import { fontFamily, useTheme } from '../../../ui/theme';
import type { LocalRecording } from '../recording-model';

export function RecordingNotesCard({
  recording,
  onEdit,
  saved,
}: {
  recording: LocalRecording;
  onEdit(): void;
  saved: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const canExpand =
    (recording.notes?.length ?? 0) > 240 || (recording.notes?.split('\n').length ?? 0) > 6;
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Ionicons name="create-outline" size={23} color={colors.accent} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          Your notes
        </Text>
      </View>
      <Text
        selectable
        numberOfLines={canExpand && !expanded ? 6 : undefined}
        style={[styles.copy, { color: recording.notes ? colors.ink : colors.inkSecondary }]}
      >
        {recording.notes ||
          'Add a name, key details or next steps. Type your notes or dictate with your phone’s keyboard.'}
      </Text>
      {canExpand ? (
        <Button
          label={expanded ? 'Show less' : 'Read full note'}
          variant="text"
          onPress={() => setExpanded(!expanded)}
        />
      ) : null}
      <Button label="Edit title & notes" variant="secondary" onPress={onEdit} />
      {saved ? (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.mintInk }]}>
          Title and notes saved on this device.
        </Text>
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.bold, fontSize: 19 },
  copy: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 24 },
  hint: { fontFamily: fontFamily.medium, fontSize: 13 },
});
