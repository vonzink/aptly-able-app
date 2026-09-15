export type UploadConsentScope = { actorId: string; recordingId: string };
export type UploadConsentRequest = UploadConsentScope & { requestedAt: number };

export function createUploadConsentRequest(scope: UploadConsentScope): UploadConsentRequest {
  return { ...scope, requestedAt: Date.now() };
}

export function canBeginConsentedUpload(
  request: UploadConsentRequest | null,
  current: { actorId: string | null; recordingId: string },
) {
  return (
    request !== null &&
    current.actorId !== null &&
    request.actorId === current.actorId &&
    request.recordingId === current.recordingId
  );
}
