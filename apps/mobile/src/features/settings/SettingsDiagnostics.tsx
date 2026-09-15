import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useAccountSession } from '../../bootstrap/AppProviders';
import { useEnrollmentController, useEnrollmentSnapshot } from '../enrollment/use-enrollment';
import { usePlaudDevice } from '../plaud-device/use-plaud-device';
import { usePlaudSync } from '../plaud-device/PlaudSyncProvider';
import {
  copyDiagnostics,
  getDiagnosticBuild,
  getRecorderPermission,
} from '../../services/diagnostics-runtime';
import { Button, Card, SectionLabel } from '../../ui/components';
import { fontFamily, useTheme } from '../../ui/theme';
import {
  appVersionLabel,
  createDiagnosticsReport,
  permissionLabels,
  recorderConnectionLabel,
  type DiagnosticBuild,
  type RecorderPermission,
} from './diagnostics';

export function SettingsDiagnostics() {
  const { colors } = useTheme();
  const enrollment = useEnrollmentSnapshot();
  const controller = useEnrollmentController();
  const { state: accountSession } = useAccountSession();
  const { snapshot: device } = usePlaudDevice();
  const { snapshot: sync } = usePlaudSync();
  const [build, setBuild] = useState<DiagnosticBuild | null>(null);
  const [permission, setPermission] = useState<RecorderPermission>('unknown');
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const [copying, setCopying] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const copyPending = useRef(false);
  const focusEpoch = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const epoch = ++focusEpoch.current;
      setFeedback(null);
      setShowReport(false);
      setCopying(false);
      const refresh = () => {
        setPermission(getRecorderPermission());
        void getDiagnosticBuild().then((info) => {
          if (epoch === focusEpoch.current) setBuild(info);
        });
      };
      refresh();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });
      return () => {
        focusEpoch.current++;
        subscription.remove();
      };
    }, []),
  );

  const report = build
    ? createDiagnosticsReport({ build, enrollment, device, sync, permission })
    : '';
  async function copy() {
    if (!report || copyPending.current) return;
    copyPending.current = true;
    const epoch = focusEpoch.current;
    setCopying(true);
    const copied = await copyDiagnostics(report);
    copyPending.current = false;
    if (epoch !== focusEpoch.current) return;
    setCopying(false);
    setFeedback(copied ? 'copied' : 'failed');
    if (!copied) setShowReport(true);
  }
  const account =
    enrollment.phase === 'signing-in'
      ? 'Signing in…'
      : enrollment.actorId
        ? (enrollment.accountEmail ?? 'Signed in · email unavailable')
        : 'Not signed in';

  return (
    <>
      <SectionLabel>ACCOUNT</SectionLabel>
      <Card>
        <Text style={[styles.label, { color: colors.inkSecondary }]}>Current sign-in</Text>
        <Text selectable style={[styles.account, { color: colors.ink }]}>
          {account}
        </Text>
        {accountSession.message && (
          <Text style={[styles.copy, { color: colors.inkSecondary }]}>
            {accountSession.message}
          </Text>
        )}
        {enrollment.actorId && (
          <Button variant="text" label="Sign out" onPress={() => void controller.signOut()} />
        )}
      </Card>
      <SectionLabel>APP & RECORDER</SectionLabel>
      <Card style={styles.card}>
        <InfoRow label="App version">{build ? appVersionLabel(build) : 'Checking…'}</InfoRow>
        <InfoRow label="Recorder connection">{recorderConnectionLabel(device)}</InfoRow>
        <InfoRow label="Bluetooth & scan access">{permissionLabels[permission]}</InfoRow>
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          {permission === 'unknown'
            ? 'Could not read permission status. An app update may be needed. '
            : permission === 'not-granted' || permission === 'restricted'
              ? 'Review Aptly Able’s permissions in your phone settings. '
              : permission === 'not-determined'
                ? 'Connect your recorder to request Bluetooth access. '
                : ''}
          Copy a report when asking for help. It includes app and connection status, without your
          email, recorder serial number, recordings, notes or sign-in credentials.
        </Text>
        <Button
          variant="secondary"
          label="Copy diagnostics"
          loading={copying}
          disabled={!build}
          onPress={() => void copy()}
        />
        {feedback && (
          <Text
            accessibilityRole="alert"
            style={[
              styles.copy,
              {
                color: feedback === 'failed' ? colors.danger : colors.inkSecondary,
              },
            ]}
          >
            {feedback === 'copied'
              ? 'Diagnostics copied.'
              : 'Could not copy automatically. Select and copy the report below.'}
          </Text>
        )}
        <Button
          variant="text"
          label={showReport ? 'Hide report' : 'View report'}
          disabled={!build}
          onPress={() => setShowReport((visible) => !visible)}
        />
        {showReport && (
          <Text
            selectable
            style={[
              styles.report,
              {
                color: colors.ink,
                backgroundColor: colors.surfaceAlt,
              },
            ]}
          >
            {report}
          </Text>
        )}
      </Card>
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.line }]}>
      <Text style={[styles.label, { color: colors.inkSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{children}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
  value: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 23 },
  account: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24, marginTop: 5 },
  copy: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 21 },
  report: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 21,
    padding: 12,
    borderRadius: 10,
  },
});
