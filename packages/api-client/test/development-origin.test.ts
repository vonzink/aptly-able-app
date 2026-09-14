import { describe, expect, it } from 'vitest';
import {
  createApiClient,
  createPlaudDeviceClient,
  createTranscriptionClient,
} from '../src/index.js';

describe.each([
  { name: 'enrollment', createClient: createApiClient },
  { name: 'Plaud', createClient: createPlaudDeviceClient },
  { name: 'transcription', createClient: createTranscriptionClient },
])('development API origin ($name)', ({ createClient }) => {
  const options = { getCredential: () => undefined };

  it('requires an explicit matching private-network origin for HTTP phone testing', () => {
    for (const baseUrl of [
      'http://192.168.110.40:4100',
      'http://10.2.3.4:4100',
      'http://172.16.1.2:4100',
    ]) {
      expect(() => createClient({ ...options, baseUrl })).toThrow();
      expect(() =>
        createClient({ ...options, baseUrl, developmentHttpOrigin: baseUrl }),
      ).not.toThrow();
    }
  });

  it.each([
    'http://example.test:4100',
    'http://8.8.8.8:4100',
    'http://169.254.169.254:4100',
    'http://172.15.1.2:4100',
    'http://172.32.1.2:4100',
    'http://0.0.0.0:4100',
    'http://192.168.110.40:4100/path',
    'http://192.168.110.40:4100?token=secret',
    'http://user:secret@192.168.110.40:4100',
  ])('does not permit an unsafe development origin: %s', (baseUrl) => {
    expect(() => createClient({ ...options, baseUrl, developmentHttpOrigin: baseUrl })).toThrow();
  });

  it('does not authorize another host or port with the development origin', () => {
    for (const baseUrl of ['http://192.168.110.41:4100', 'http://192.168.110.40:4101'])
      expect(() =>
        createClient({ ...options, baseUrl, developmentHttpOrigin: 'http://192.168.110.40:4100' }),
      ).toThrow();
  });
});
