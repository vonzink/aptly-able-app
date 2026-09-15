import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useEnrollmentController, useEnrollmentSnapshot } from '../../bootstrap/AppProviders';
import { Button, Card, SectionLabel } from '../../ui/components';
import { ConfirmationDialog } from '../../ui/ConfirmationDialog';
import { fontFamily, useTheme } from '../../ui/theme';
import { usePlaudSync } from './PlaudSyncProvider';
import { usePlaudDevice } from './use-plaud-device';

export function RecorderPairingCard() {
  const { colors } = useTheme();
  const { controller, snapshot } = usePlaudDevice();
  const { controller: syncController, snapshot: sync } = usePlaudSync();
  const enrollmentController = useEnrollmentController();
  const enrollment = useEnrollmentSnapshot();
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const confirming = useRef(false);
  const activeOperation = enrollment.operation?.status === 'pending';
  const recovering = snapshot.release !== null;
  const blocked = sync.busy || sync.activity === 'recording' || sync.activity === 'paused';
  const label =
    snapshot.release?.cloud && snapshot.release.device
      ? 'Finish removing recorder'
      : !activeOperation
        ? 'Request cloud release'
        : recovering
          ? snapshot.release?.device
            ? 'Retry cloud release'
            : 'Retry unfinished unpair steps'
          : 'Unpair recorder';
  useFocusEffect(useCallback(() => () => setConfirmUnpair(false), []));

  function unpair() {
    const currentEnrollment = enrollmentController.getSnapshot();
    const currentDevice = controller.getSnapshot();
    const currentSync = syncController.getSnapshot();
    // A transfer or a different enrollment may arrive while the confirmation is open.
    if (
      confirming.current ||
      currentSync.busy ||
      currentSync.activity === 'recording' ||
      currentSync.activity === 'paused'
    )
      return;
    setConfirmUnpair(false);
    if (
      currentEnrollment.actorId !== enrollment.actorId ||
      currentEnrollment.operation?.id !== enrollment.operation?.id ||
      currentDevice.assignment?.serial !== snapshot.assignment?.serial ||
      currentDevice.phase === 'unpaired'
    )
      return;
    confirming.current = true;
    void controller.unpair().finally(() => {
      confirming.current = false;
    });
  }

  return (
    <Card style={styles.card}>
      <SectionLabel>PAIRING</SectionLabel>
      <Text style={[styles.copy, { color: colors.inkSecondary }]}>
        Disconnecting keeps your pairing saved. Unpair only when moving the recorder to another
        account or app, or before uninstalling Aptly Able.
      </Text>
      {snapshot.release ? (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Cloud release: {snapshot.release.cloud ? 'confirmed' : 'not confirmed'}
          {'\n'}Recorder release: {snapshot.release.device ? 'confirmed' : 'not confirmed'}
          {'\n'}Dashboard release: {snapshot.release.assignment ? 'confirmed' : 'not confirmed'}
        </Text>
      ) : null}
      {snapshot.phase !== 'unpaired' &&
      (!snapshot.release?.cloud || snapshot.release.device || snapshot.phase === 'ready') ? (
        <Button
          label={label}
          variant="danger"
          disabled={blocked}
          onPress={() => setConfirmUnpair(true)}
        />
      ) : null}
      {blocked ? (
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Stop recording and finish any transfers before unpairing.
        </Text>
      ) : null}
      <ConfirmationDialog
        visible={confirmUnpair}
        title={recovering || !activeOperation ? 'Continue unpairing?' : 'Unpair this recorder?'}
        description={`This disconnects ${snapshot.assignment ? `recorder ending ${snapshot.assignment.serial.slice(-4)}` : 'your assigned recorder'}, releases its dashboard assignment, and removes its saved setup from this phone. Connecting again will require a new assignment and enrollment invitation.`}
        confirmLabel={label}
        cancelLabel="Keep current pairing"
        disabled={blocked}
        onConfirm={unpair}
        onCancel={() => setConfirmUnpair(false)}
      >
        <Text style={[styles.copy, { color: colors.inkSecondary }]}>
          Keep your recorder nearby and leave the app open until unpairing and dashboard release
          finish. Recordings already saved in the app stay here.
        </Text>
        {blocked ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.copy, { color: colors.inkSecondary }]}
          >
            A recording or transfer is active. Finish it before continuing.
          </Text>
        ) : null}
      </ConfirmationDialog>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  copy: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
});
