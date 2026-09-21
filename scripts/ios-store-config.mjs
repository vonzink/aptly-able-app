import { URL } from 'node:url';
export function publicOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Set a valid public HTTPS production API origin.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    /(^localhost$|\.local$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^\[)/i.test(
      url.hostname,
    )
  ) {
    throw new Error(
      'Production API must be a public HTTPS origin with no credentials, path or private/local address.',
    );
  }
  return url.origin;
}
export function validateStoreEnvironment(env) {
  if (env.APTLY_RELEASE_CHANNEL !== 'store')
    throw new Error('Set APTLY_RELEASE_CHANNEL=store explicitly.');
  if (
    env.APTLY_ANDROID_PREVIEW === '1' ||
    (env.EXPO_PUBLIC_RECORDER_MODE && env.EXPO_PUBLIC_RECORDER_MODE !== 'native')
  )
    throw new Error('Store requires the native recorder profile; preview/mock mode is forbidden.');
  if (env.EXPO_PUBLIC_AUTH_MODE !== 'pilot')
    throw new Error(
      'Set EXPO_PUBLIC_AUTH_MODE=pilot for the existing authenticated account API (never demo).',
    );
  const origin = publicOrigin(env.EXPO_PUBLIC_API_URL);
  if (origin !== publicOrigin(env.APTLY_PRODUCTION_API_ORIGIN))
    throw new Error(
      'EXPO_PUBLIC_API_URL must match the owner-approved APTLY_PRODUCTION_API_ORIGIN.',
    );
  return { origin, wifi: env.APTLY_IOS_BLUETOOTH_ONLY !== '1' };
}
export function readinessErrors(metadata, evidenceExists) {
  const errors = [];
  if (
    !metadata.legalName?.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.supportEmail ?? '')
  )
    errors.push('Provide the confirmed legal name and support email in store-readiness.json.');
  for (const key of ['privacyPolicyUrl', 'supportUrl']) {
    try {
      const u = new URL(metadata[key]);
      if (u.protocol !== 'https:' || u.username || u.password) throw new Error();
    } catch {
      errors.push(`Provide a public HTTPS ${key} in store-readiness.json.`);
    }
  }
  for (const key of [
    'privacyPolicyReviewed',
    'providerPrivacyReviewed',
    'providerDistributionReviewed',
    'providerErasureVerified',
    'backupRetentionReviewed',
    'hardwareReviewVerified',
  ]) {
    if (metadata[key] !== true)
      errors.push(
        `Store readiness blocked: ${key} is not confirmed; complete and record the owner/vendor review before setting it true.`,
      );
  }
  if (!metadata.providerEvidencePath || !evidenceExists(metadata.providerEvidencePath))
    errors.push(
      'Supply providerEvidencePath pointing to a real vendor review record covering exact Plaud versions/hashes, binary distribution licenses and support, required-reason APIs, SDK privacy/signatures, endpoints, retention and erasure; absence of a Plaud manifest is not itself proof of compliance.',
    );
  return errors;
}
