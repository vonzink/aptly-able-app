import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../ui/components';
import { fontFamily, useTheme } from '../../../ui/theme';
import { useRecordingsController } from '../RecordingsProvider';
import {
  MAX_RECORDING_NOTES_LENGTH,
  MAX_RECORDING_TITLE_LENGTH,
  type LocalRecording,
} from '../recording-model';

/** Mounted for one recording/edit session so metadata refreshes never overwrite the draft. */
export function RecordingDetailsEditor({
  recording,
  onClose,
  onSaved,
}: {
  recording: LocalRecording;
  onClose(): void;
  onSaved(): void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const controller = useRecordingsController();
  const initial = useRef({ title: recording.title, notes: recording.notes ?? '' }).current;
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const dirty = title !== initial.title || notes !== initial.notes;
  const fieldStyle = [
    styles.field,
    { color: colors.ink, backgroundColor: colors.bg, borderColor: colors.line },
  ];
  function close() {
    if (locked.current) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }
  async function save() {
    if (locked.current || !title.trim()) return;
    locked.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await controller.saveDetails(recording.id, { title, notes });
      if (saved) onSaved();
      else
        setError(controller.getSnapshot().error ?? 'Your changes could not be saved. Try again.');
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      >
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={[styles.sheet, { backgroundColor: colors.surface }]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {discarding ? (
              <>
                <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
                  Discard your edits?
                </Text>
                <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                  Your saved title and notes will stay as they were.
                </Text>
                <Button label="Keep editing" onPress={() => setDiscarding(false)} />
                <Button label="Discard edits" variant="danger" onPress={onClose} />
              </>
            ) : (
              <>
                <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
                  Title & notes
                </Text>
                <Text style={[styles.copy, { color: colors.inkSecondary }]}>
                  Give this conversation a clear name and keep the details you want to remember.
                </Text>
                <View style={styles.group}>
                  <Text style={[styles.label, { color: colors.ink }]}>Recording title</Text>
                  <TextInput
                    accessibilityLabel="Recording title"
                    value={title}
                    onChangeText={setTitle}
                    maxLength={MAX_RECORDING_TITLE_LENGTH}
                    editable={!saving}
                    style={fieldStyle}
                    placeholder="For example, Project discussion"
                    placeholderTextColor={colors.inkMuted}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                  />
                  {!title.trim() ? (
                    <Text style={[styles.hint, { color: colors.danger }]}>
                      Enter a title before saving.
                    </Text>
                  ) : null}
                </View>
                <View style={styles.group}>
                  <Text style={[styles.label, { color: colors.ink }]}>Your notes</Text>
                  <TextInput
                    accessibilityLabel="Your notes for this recording"
                    value={notes}
                    onChangeText={setNotes}
                    maxLength={MAX_RECORDING_NOTES_LENGTH}
                    editable={!saving}
                    multiline
                    textAlignVertical="top"
                    style={[...fieldStyle, styles.notes]}
                    placeholder="Key details, ideas or next steps…"
                    placeholderTextColor={colors.inkMuted}
                    autoCapitalize="sentences"
                  />
                  <Text style={[styles.hint, { color: colors.inkSecondary }]}>
                    Type here, or use the microphone on your phone’s keyboard to dictate.
                  </Text>
                  <Text style={[styles.count, { color: colors.inkSecondary }]}>
                    {notes.length.toLocaleString()} / 10,000 characters
                  </Text>
                </View>
                <Text style={[styles.hint, { color: colors.inkSecondary }]}>
                  Saved in this app with the recording. Clearing temporary audio keeps these notes.
                </Text>
                {error ? (
                  <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
                    {error}
                  </Text>
                ) : null}
                <Button
                  label="Save title & notes"
                  onPress={() => void save()}
                  loading={saving}
                  disabled={!dirty || !title.trim()}
                />
                <Button label="Cancel" variant="text" disabled={saving} onPress={close} />
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    paddingHorizontal: 16,
  },
  sheet: { width: '100%', maxWidth: 540, maxHeight: '100%', borderRadius: 22, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  content: { padding: 22, gap: 18 },
  heading: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 31 },
  copy: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 23 },
  group: { gap: 8 },
  label: { fontFamily: fontFamily.semibold, fontSize: 15 },
  field: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  notes: { minHeight: 160, maxHeight: 260 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19 },
  count: { fontFamily: fontFamily.medium, fontSize: 12, textAlign: 'right' },
});
