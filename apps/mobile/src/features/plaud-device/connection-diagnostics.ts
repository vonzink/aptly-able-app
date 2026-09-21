/** Fixed labels only. SDK free text, serials and credentials must never enter support reports. */
const stages = [
  'partner_key',
  'device_signing',
  'start',
  'gatt_connect',
  'set_notify',
  'set_battery_notify',
  'read_battery',
  'set_data_notify',
  'pre_handshake',
  'send_rsa_public',
  'first_handshake',
  'two_handshake',
  'handshake_get_ssn',
  'change_handshake_timeout',
  'sync_time',
] as const;
const details = [
  'pending',
  'ok',
  'old_protocol_ok',
  'status_0',
  'status_1',
  'sn_signature_empty',
  'sn_signature_invalid',
  'user_rsa_public_key_empty',
  'bind_token_empty',
  'send_fail',
  'failed',
  'unknown',
] as const;

export interface ConnectionDiagnostics {
  stage: string | null;
  detail: string | null;
  bluetooth: boolean;
  binding: boolean;
  deviceReady: boolean;
}

export function safeConnectionStage(value: unknown): string | null {
  return typeof value === 'string' && (stages as readonly string[]).includes(value) ? value : null;
}
export function safeConnectionDetail(value: unknown): string | null {
  return typeof value === 'string' && (details as readonly string[]).includes(value) ? value : null;
}

export function handshakeFailureMessage(connection: ConnectionDiagnostics | null): string | null {
  if (
    connection?.detail === 'status_1' &&
    ['pre_handshake', 'send_rsa_public', 'first_handshake', 'two_handshake'].includes(
      connection.stage ?? '',
    )
  )
    return 'The recorder rejected this account’s connection. It may still be paired to a previous app or account. Unpair it in that app while the recorder is nearby, then try again. If it was already unpaired, contact support with your setup details. Do not uninstall or reset the recorder.';
  if (
    ['sn_signature_empty', 'sn_signature_invalid', 'bind_token_empty'].includes(
      connection?.detail ?? '',
    )
  )
    return 'Plaud could not authorize this recorder for secure setup. Check your internet connection and search again. If it repeats, share setup details from Settings with support.';
  if (connection?.detail === 'user_rsa_public_key_empty')
    return nativePreparationMessage('ERR_PLAUD_AUTH_KEY');
  return null;
}

function nativePreparationMessage(code: string): string | null {
  if (code === 'ERR_PLAUD_AUTH_KEY')
    return 'Plaud authentication did not finish. Check that your phone has internet access, then search again. If it repeats, share setup details from Settings with support.';
  if (code === 'ERR_PLAUD_DEVICE_SIGNING')
    return 'Plaud could not authorize this recorder. Check your internet connection and try again. If it repeats, share setup details from Settings with support.';
  return null;
}

export function connectionPreparationError(error: unknown): string | null {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? nativePreparationMessage(error.code)
    : null;
}

export function connectionProgress(connection: ConnectionDiagnostics | null): string {
  if (connection?.deviceReady) return 'Confirming the remaining connection checks…';
  if (connection?.binding) return 'Pairing accepted. Waiting for the recorder to report ready…';
  if (connection?.bluetooth) return 'Bluetooth connected. Confirming secure pairing…';
  if (connection?.stage === 'partner_key') return 'Checking access with Plaud…';
  if (connection?.stage === 'device_signing') return 'Authorizing your assigned recorder…';
  return 'Opening a secure Bluetooth connection…';
}
