import { expect, it } from 'vitest';
import {
  initialRecordingActivityMemory,
  updateRecordingActivity,
} from '../src/features/plaud-device/recording-activity-model';

it('keeps an active recorder visible as last-known after Bluetooth disconnects', () => {
  const active = updateRecordingActivity(initialRecordingActivityMemory, {
    actorId: 'actor-a',
    connected: true,
    activity: 'recording',
  });
  const disconnected = updateRecordingActivity(active.memory, {
    actorId: 'actor-a',
    connected: false,
    activity: 'unknown',
  });

  expect(disconnected.banner).toMatchObject({
    kind: 'uncertain',
    label: 'Recording status unknown',
  });
  expect(disconnected.banner?.detail).toContain('Last known state: Recording');
});

it('never represents unknown or disconnected state as stopped', () => {
  const unknown = updateRecordingActivity(initialRecordingActivityMemory, {
    actorId: 'actor-a',
    connected: true,
    activity: 'unknown',
  });
  const observedUnknown = updateRecordingActivity(initialRecordingActivityMemory, {
    actorId: 'actor-a',
    connected: true,
    activity: 'unknown',
  });
  const disconnected = updateRecordingActivity(observedUnknown.memory, {
    actorId: 'actor-a',
    connected: false,
    activity: 'idle',
  });

  expect(unknown.banner?.label).not.toMatch(/stopped/i);
  expect(disconnected.banner?.label ?? '').not.toMatch(/stopped/i);
});

it('forgets the previous account recording state on sign-out or actor change', () => {
  const active = updateRecordingActivity(initialRecordingActivityMemory, {
    actorId: 'actor-a',
    connected: true,
    activity: 'paused',
  });
  const signedOut = updateRecordingActivity(active.memory, {
    actorId: null,
    connected: false,
    activity: 'unknown',
  });
  const anotherActor = updateRecordingActivity(active.memory, {
    actorId: 'actor-b',
    connected: false,
    activity: 'unknown',
  });

  expect(signedOut.banner).toBeNull();
  expect(anotherActor.banner).toBeNull();
});
