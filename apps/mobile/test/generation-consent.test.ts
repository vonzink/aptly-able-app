import { expect, it } from 'vitest';
import {
  canBeginConsentedUpload,
  createUploadConsentRequest,
} from '../src/features/transcription/generation-consent';

it('accepts consent only for the actor and recording shown in the disclosure', () => {
  const request = createUploadConsentRequest({ actorId: 'actor-a', recordingId: 'recording-a' });

  expect(canBeginConsentedUpload(request, { actorId: 'actor-a', recordingId: 'recording-a' })).toBe(
    true,
  );
  expect(canBeginConsentedUpload(request, { actorId: 'actor-b', recordingId: 'recording-a' })).toBe(
    false,
  );
  expect(canBeginConsentedUpload(request, { actorId: 'actor-a', recordingId: 'recording-b' })).toBe(
    false,
  );
  expect(canBeginConsentedUpload(request, { actorId: null, recordingId: 'recording-a' })).toBe(
    false,
  );
});
