import { describe, expect, test } from 'vitest';
import {
  installationDownload,
  installationLink,
} from '../src/features/installation/installation-link';

describe('installation continuation', () => {
  const token = 'A'.repeat(43);
  test('retains fragment in native URL and honors platform selection', () => {
    for (const platform of ['android', 'ios']) {
      expect(
        installationLink(`https://pilot.example/enroll?platform=${platform}#token=${token}`),
      ).toEqual({ platform, appUrl: `aptlyable://enroll#token=${token}` });
    }
  });
  test('rejects missing, malformed, duplicated and query-string tokens', () => {
    for (const suffix of [
      '',
      '#token=short',
      `?token=${token}#token=${token}`,
      `#token=${token}&token=${token}`,
    ])
      expect(installationLink(`https://pilot.example/enroll${suffix}`).appUrl).toBeNull();
  });
  test('missing build is unavailable and download URLs are constrained', () => {
    expect(installationDownload(undefined, 'android')).toBeNull();
    expect(installationDownload('javascript:alert(1)', 'android')).toBeNull();
    expect(
      installationDownload('https://pilot.example/downloads/aptly-able.apk', 'android'),
    ).toContain('.apk');
    expect(installationDownload('https://example.com/join/abc', 'ios')).toBeNull();
    expect(installationDownload('https://testflight.apple.com/join/abc', 'ios')).toBe(
      'https://testflight.apple.com/join/abc',
    );
  });
});
