import Ionicons from '@expo/vector-icons/Ionicons';
import type { RecorderSummary } from '@aptly/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, PageHeader, Screen, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import { RecorderPhoto } from './RecorderPhoto';
import { RecorderStatusMeters } from './RecorderStatusMeters';
import { useRecorderController, useRecorderSnapshot } from './use-recorder';

export default function RecorderSimulationScreen() {
  const controller = useRecorderController();
  const snapshot = useRecorderSnapshot();
  const { colors } = useTheme();

  if (snapshot.status === 'connected' && snapshot.connectedRecorder) {
    const connected = snapshot.connectedRecorder;
    return (
      <Screen>
        <PageHeader
          mode="simulated"
          title="Your recorder"
          copy="This connection is a local simulation for reviewing the app foundation."
        />
        <Card>
          <View style={local.identity}>
            <RecorderPhoto model={connected.model} size={120} />
            <View style={local.identityWords}>
              <Text style={[local.name, { color: colors.ink }]}>{connected.name}</Text>
              <Text style={[local.connected, { color: colors.mintInk }]}>
                ● Connected · simulated
              </Text>
              <Text style={[local.serial, { color: colors.inkSecondary }]}>
                •••• {connected.serialSuffix}
              </Text>
            </View>
          </View>
          <RecorderStatusMeters
            batteryPercent={connected.batteryPercent}
            charging={null}
            storage={{
              totalBytes: connected.storageTotalBytes,
              freeBytes: connected.storageFreeBytes,
            }}
          />
        </Card>
        <View style={[local.info, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="information-circle-outline" size={21} color={colors.accent} />
          <Text style={[local.infoText, { color: colors.inkSecondary }]}>
            This preview simulates the connection. Real recorder pairing and recording transfer
            require the Plaud SDK and a physical phone.
          </Text>
        </View>
        <Button
          label="Disconnect recorder"
          variant="danger"
          onPress={() => void controller.disconnect()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        mode="simulated"
        eyebrow="PREVIEW ASSIGNED RECORDER SETUP"
        title="Your Plaud recorder is ready to set up"
        copy="This preview represents opening an enrollment link for the recorder assigned to you. No enrollment link, camera, or account identity is created in this build."
      />
      {snapshot.error ? (
        <View accessibilityRole="alert" style={[local.error, { backgroundColor: colors.dangerBg }]}>
          <View style={[local.alertIcon, { backgroundColor: colors.danger }]}>
            <Text style={local.alertMark}>!</Text>
          </View>
          <Text style={[local.errorText, { color: colors.ink }]}>{snapshot.error}</Text>
        </View>
      ) : null}
      {snapshot.status === 'found' ? (
        <>
          <SectionLabel>ASSIGNED RECORDER NEARBY</SectionLabel>
          {snapshot.recorders.map((item) => (
            <RecorderResult
              key={item.id}
              recorder={item}
              onConnect={() => void controller.connect(item)}
            />
          ))}
          <Button label="Search again" variant="secondary" onPress={() => void controller.scan()} />
        </>
      ) : snapshot.status === 'scanning' ? (
        <Scanning onCancel={() => controller.cancel()} />
      ) : snapshot.status === 'connecting' ? (
        <Connecting />
      ) : (
        <>
          <View style={[local.assignment, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.mintInk} />
            <View style={local.assignmentWords}>
              <Text style={[local.assignmentTitle, { color: colors.ink }]}>Plaud NotePin S</Text>
              <Text style={[local.assignmentCopy, { color: colors.inkSecondary }]}>
                Assigned to you · •••• 4812
              </Text>
            </View>
          </View>
          <EmptyState
            icon={
              <View style={[local.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
                <RecorderPhoto model="notepins" size={100} />
              </View>
            }
            title="Allow recorder discovery"
            copy="Continue to simulate Bluetooth access and search only for your assigned recorder. This preview does not request an OS permission or contact hardware."
            action={
              <Button
                label={snapshot.status === 'error' ? 'Search again' : 'Continue with simulation'}
                onPress={() => void controller.scan()}
              />
            }
          />
        </>
      )}
    </Screen>
  );
}

function RecorderResult({
  recorder,
  onConnect,
}: {
  recorder: RecorderSummary;
  onConnect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card style={local.result}>
      <View style={local.signal}>
        <View style={[local.bar, { height: 7, backgroundColor: colors.accent }]} />
        <View style={[local.bar, { height: 11, backgroundColor: colors.accent }]} />
        <View style={[local.bar, { height: 15, backgroundColor: colors.accent }]} />
        <View style={[local.bar, { height: 19, backgroundColor: colors.line }]} />
      </View>
      <View style={local.resultWords}>
        <Text style={[local.resultName, { color: colors.ink }]}>{recorder.name}</Text>
        <Text style={[local.resultMeta, { color: colors.inkSecondary }]}>
          •••• {recorder.serialSuffix} · Strong signal
        </Text>
      </View>
      <View style={local.connectButton}>
        <Button label="Connect" variant="secondary" onPress={onConnect} />
      </View>
    </Card>
  );
}
function Scanning({ onCancel }: { onCancel: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={local.center}>
      <View style={[local.scanOuter, { borderColor: colors.orange }]}>
        <View style={[local.scanInner, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="radio-outline" size={30} color={colors.accent} />
        </View>
      </View>
      <Text style={[local.centerTitle, { color: colors.ink }]}>Looking for your recorder</Text>
      <Text style={[local.centerCopy, { color: colors.inkSecondary }]}>
        Keep your recorder nearby and powered on.
      </Text>
      <View style={local.full}>
        <Button label="Cancel" variant="text" onPress={onCancel} />
      </View>
    </View>
  );
}
function Connecting() {
  const { colors } = useTheme();
  return (
    <View style={local.center}>
      <View style={[local.scanInner, { backgroundColor: colors.orangeBg }]}>
        <Ionicons name="radio-outline" size={30} color={colors.orangeInk} />
      </View>
      <Text style={[local.centerTitle, { color: colors.ink }]}>Connecting to your recorder</Text>
      <Text style={[local.centerCopy, { color: colors.inkSecondary }]}>
        This simulated connection usually takes a moment.
      </Text>
      <View style={local.checks}>
        <Check label="Recorder found" state="complete" />
        <Check label="Establishing connection" state="current" />
        <Check label="Finishing setup" state="pending" />
      </View>
    </View>
  );
}
function Check({ label, state }: { label: string; state: 'complete' | 'current' | 'pending' }) {
  const { colors } = useTheme();
  const bg =
    state === 'complete' ? colors.mintInk : state === 'current' ? colors.orange : 'transparent';
  return (
    <View style={local.check}>
      <View
        style={[
          local.checkCircle,
          { backgroundColor: bg, borderColor: state === 'pending' ? colors.line : bg },
        ]}
      >
        <Text style={{ color: state === 'pending' ? colors.inkMuted : colors.accentInk }}>
          {state === 'complete' ? '✓' : state === 'current' ? '●' : ''}
        </Text>
      </View>
      <Text
        style={[
          local.checkText,
          {
            color:
              state === 'pending'
                ? colors.inkMuted
                : state === 'complete'
                  ? colors.inkSecondary
                  : colors.ink,
            fontFamily: state === 'current' ? fontFamily.semibold : fontFamily.medium,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
const local = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 17 },
  recorderImage: { width: 54, height: 72 },
  identityWords: { flex: 1 },
  name: { fontFamily: fontFamily.bold, fontSize: 18 },
  connected: { fontFamily: fontFamily.semibold, fontSize: 12.5, marginTop: 5 },
  serial: { fontFamily: fontFamily.regular, fontSize: 12.5, marginTop: 4 },
  info: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14 },
  infoText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
  assignment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    padding: 14,
  },
  assignmentWords: { flex: 1 },
  assignmentTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  assignmentCopy: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 3 },
  error: { flexDirection: 'row', gap: 11, alignItems: 'center', borderRadius: 12, padding: 14 },
  alertIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertMark: { color: '#FFFFFF', fontFamily: fontFamily.bold },
  errorText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 20 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRecorder: { width: 48, height: 67 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  signal: { width: 24, height: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 2 },
  resultWords: { flex: 1 },
  resultName: { fontFamily: fontFamily.semibold, fontSize: 15 },
  resultMeta: { fontFamily: fontFamily.regular, fontSize: 12.5, marginTop: 4 },
  connectButton: { width: 108 },
  center: { alignItems: 'center', paddingTop: 34, paddingHorizontal: 12 },
  scanOuter: {
    width: 132,
    height: 132,
    borderWidth: 2,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: { fontFamily: fontFamily.bold, fontSize: 23, textAlign: 'center', marginTop: 25 },
  centerCopy: {
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  full: { width: '100%', marginTop: 30 },
  checks: { width: '100%', marginTop: 30, gap: 16 },
  check: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontSize: 15 },
});
