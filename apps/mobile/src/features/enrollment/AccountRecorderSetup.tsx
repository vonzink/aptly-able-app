import { recorderIdentitySchema, recorderModels, type RecorderModel } from '@aptly/contracts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecorderPhoto } from '../recorder/RecorderPhoto';
import { useEnrollmentController, useEnrollmentSnapshot } from './use-enrollment';

/** Account-owned choices only; permissions and mutations remain in the controller/API. */
export function AccountRecorderSetup() {
  const controller = useEnrollmentController();
  const state = useEnrollmentSnapshot();
  const { colors } = useTheme();
  const [adding, setAdding] = useState(false);
  const [model, setModel] = useState<RecorderModel>('notepins');
  const [serial, setSerial] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const busy = state.phase === 'adding-recorder';
  const showForm = state.canAddRecorder && (adding || state.recorders.length === 0);

  async function submit() {
    const result = recorderIdentitySchema.safeParse({ model, serial });
    if (!result.success) {
      setValidation(result.error.issues[0]?.message ?? 'Check your recorder details.');
      return;
    }
    setValidation(null);
    await controller.addRecorder(result.data);
    // Retain the entered values on failure. Successful addition exposes the recorder card.
    if (controller.getSnapshot().recorders !== state.recorders) {
      setSerial('');
      setAdding(false);
    }
  }

  return (
    <>
      {state.message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: colors.ink }]}>
          {state.message}
        </Text>
      ) : null}
      {!showForm &&
        state.recorders.map((item) => (
          <Card key={item.assignmentId} style={styles.card}>
            <View style={styles.photo}>
              <RecorderPhoto model={item.recorder.model} size={144} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
              {recorderModels[item.recorder.model].label}
            </Text>
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              Serial ending in {item.recorder.serialSuffix}
            </Text>
            <Text style={[styles.copy, { color: colors.inkSecondary }]}>
              {item.setupBlocked
                ? 'Setup access was revoked. Ask your administrator for a new invitation.'
                : 'Saved to your account. Continue to connect this recorder with Bluetooth.'}
            </Text>
            {!item.setupBlocked && (
              <Button
                label="Continue with this recorder"
                onPress={() => void controller.selectRecorder(item.assignmentId)}
              />
            )}
          </Card>
        ))}
      {showForm ? (
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            Add your recorder
          </Text>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Choose the model and enter its full serial number. You only need to do this once.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.models}>
            {(['notepins', 'notepro'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                aria-checked={model === value}
                accessibilityState={{ checked: model === value, disabled: busy }}
                accessibilityLabel={recorderModels[value].label}
                disabled={busy}
                onPress={() => {
                  setModel(value);
                  setValidation(null);
                }}
                style={[
                  styles.model,
                  {
                    borderColor: model === value ? colors.accent : colors.line,
                    backgroundColor: model === value ? colors.surfaceAlt : colors.surface,
                  },
                ]}
              >
                <RecorderPhoto model={value} size={84} />
                <Text style={[styles.modelLabel, { color: colors.ink }]}>
                  {recorderModels[value].label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: colors.ink }]}>Serial number</Text>
          <TextInput
            accessibilityLabel="Recorder serial number"
            autoCapitalize="characters"
            autoCorrect={false}
            value={serial}
            onChangeText={(value) => {
              setSerial(value);
              setValidation(null);
            }}
            editable={!busy}
            placeholder={`Starts with ${recorderModels[model].serialPrefix}`}
            placeholderTextColor={colors.inkMuted}
            maxLength={64}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[
              styles.input,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
            ]}
          />
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Use the SN printed on the recorder or its box, including any letters. The last four
            digits alone won’t work.
          </Text>
          {validation ? (
            <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>
              {validation}
            </Text>
          ) : null}
          <Button label="Save recorder" loading={busy} onPress={() => void submit()} />
          {state.recorders.length > 0 && (
            <Button
              label="Back to my recorders"
              variant="text"
              disabled={busy}
              onPress={() => setAdding(false)}
            />
          )}
        </Card>
      ) : state.canAddRecorder ? (
        <Button label="Add a different recorder" variant="text" onPress={() => setAdding(true)} />
      ) : state.recorders.length === 0 ? (
        <Card style={styles.card}>
          <Text style={[styles.title, { color: colors.ink }]}>Waiting for your recorder</Text>
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            Ask your administrator to assign a recorder to this account. Then check again here.
          </Text>
        </Card>
      ) : null}
      {!busy && (
        <Button
          label="Check for assigned recorders"
          variant="text"
          onPress={() => void controller.loadRecorders()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  photo: { alignItems: 'center' },
  title: { fontFamily: fontFamily.bold, fontSize: 20 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fontFamily.semibold, fontSize: 15 },
  models: { flexDirection: 'row', gap: 10 },
  model: { flex: 1, alignItems: 'center', borderWidth: 2, borderRadius: 12, padding: 8, gap: 8 },
  modelLabel: { fontFamily: fontFamily.semibold, fontSize: 13, textAlign: 'center' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
});
