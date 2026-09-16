export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
}
export interface RecordingLocation {
  version: 1;
  sessionId: number;
  startedAt: number;
  endedAt: number | null;
  status: 'recording' | 'paused' | 'complete' | 'interrupted';
  reason: string | null;
  points: LocationPoint[];
  droppedPoints: number;
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8.64e15;
function isPoint(value: unknown): value is LocationPoint {
  if (!object(value)) return false;
  return (
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180 &&
    typeof value.accuracy === 'number' &&
    Number.isFinite(value.accuracy) &&
    value.accuracy >= 0 &&
    value.accuracy <= 1000 &&
    time(value.capturedAt)
  );
}
/** Boundary for native journals and persisted metadata; never attach a different session. */
export function readRecordingLocation(value: unknown, sessionId: number): RecordingLocation | null {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.sessionId !== sessionId ||
    !Number.isSafeInteger(sessionId) ||
    sessionId < 0 ||
    !time(value.startedAt) ||
    !(value.endedAt === null || (time(value.endedAt) && value.endedAt >= value.startedAt)) ||
    !['recording', 'paused', 'complete', 'interrupted'].includes(String(value.status)) ||
    !(value.reason === null || (typeof value.reason === 'string' && value.reason.length <= 100)) ||
    !Number.isSafeInteger(value.droppedPoints) ||
    Number(value.droppedPoints) < 0 ||
    !Array.isArray(value.points) ||
    value.points.length > 600
  )
    return null;
  if (['complete', 'interrupted'].includes(String(value.status)) && value.endedAt === null)
    return null;
  let previous = value.startedAt;
  const points: LocationPoint[] = [];
  for (const point of value.points) {
    if (
      !isPoint(point) ||
      point.capturedAt < previous ||
      (typeof value.endedAt === 'number' && point.capturedAt > value.endedAt + 5000)
    )
      return null;
    previous = point.capturedAt;
    // Copy only the allowed keys. Native/vendor payloads must not expand persisted data.
    points.push({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      capturedAt: point.capturedAt,
    });
  }
  return {
    version: 1,
    sessionId,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    status: value.status as RecordingLocation['status'],
    reason: value.reason,
    droppedPoints: Number(value.droppedPoints),
    points,
  };
}
export function locationMapUrl(point: LocationPoint, platform: string): string | null {
  if (!isPoint(point)) return null;
  const coordinates = `${point.latitude},${point.longitude}`;
  return platform === 'ios'
    ? `https://maps.apple.com/?ll=${coordinates}&q=Recording%20location`
    : `https://www.google.com/maps/search/?api=1&query=${coordinates}`;
}
