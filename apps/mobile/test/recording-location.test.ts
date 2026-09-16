import { describe, expect, it } from 'vitest';
import {
  readRecordingLocation,
  locationMapUrl,
} from '../src/features/recording-location/location-model';
import { createRecordingsController } from '../src/features/recordings/recordings-controller';
import { recordingStorageFixture } from './recording-storage-fixture';

const actorId = '201b4a9f-80dd-4b9b-bdd0-ac5e907ddc08';
const source = {
  kind: 'plaud' as const,
  actorId,
  serial: '882123456789',
  sessionId: 42,
  sizeBytes: 11,
};
const startedAt = Date.parse('2026-09-16T12:00:00Z');
const location = {
  version: 1 as const,
  sessionId: 42,
  startedAt,
  endedAt: startedAt + 60000,
  status: 'complete' as const,
  reason: null,
  droppedPoints: 0,
  points: [{ latitude: 39.7, longitude: -104.9, accuracy: 18, capturedAt: startedAt + 1000 }],
};

describe('recording location metadata', () => {
  it('accepts bounded coordinates for the same recording session', () => {
    expect(readRecordingLocation(location, 42)).toEqual(location);
    expect(readRecordingLocation(location, 43)).toBeNull();
  });
  it('rejects invalid coordinates, time order, excessive samples and pre-recording fixes', () => {
    for (const patch of [
      { points: [{ ...location.points[0], latitude: NaN }] },
      { points: [{ ...location.points[0], longitude: 181 }] },
      { points: [{ ...location.points[0], accuracy: -1 }] },
      { points: [{ ...location.points[0], accuracy: 1001 }] },
      { points: [{ ...location.points[0], capturedAt: startedAt - 1 }] },
      { points: Array.from({ length: 601 }, () => location.points[0]) },
      { endedAt: startedAt - 1 },
      { status: 'made-up' },
      { droppedPoints: -1 },
    ])
      expect(readRecordingLocation({ ...location, ...patch }, 42)).toBeNull();
  });
  it('builds map links only from valid coordinates', () => {
    expect(locationMapUrl(location.points[0]!, 'ios')).toBe(
      'https://maps.apple.com/?ll=39.7,-104.9&q=Recording%20location',
    );
    expect(locationMapUrl({ ...location.points[0]!, latitude: Infinity }, 'android')).toBeNull();
  });
});

async function fixture(
  overrides: { read?: () => Promise<unknown>; remove?: () => Promise<void> } = {},
) {
  const f = await recordingStorageFixture();
  let pending: unknown = structuredClone(location);
  const locations = {
    read: overrides.read ?? (async () => pending),
    remove:
      overrides.remove ??
      (async () => {
        pending = null;
      }),
    clearActor: async () => {
      pending = null;
    },
  };
  const controller = createRecordingsController({
    store: f.store,
    now: () => new Date().toISOString(),
    createId: () => f.record.id,
    locations,
  });
  await controller.initialize();
  return { ...f, controller, getPending: () => pending };
}

describe('location attachment and deletion', () => {
  it('persists location with audio before removing the native pending copy', async () => {
    const f = await fixture();
    expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
    expect((await f.store.list())[0]?.location).toEqual(location);
    expect(f.getPending()).toBeNull();
  });
  it('preserves the native pending copy when the audio save fails', async () => {
    const f = await fixture();
    f.store.saveAudio = async () => {
      throw new Error('disk full');
    };
    expect(await f.controller.importDeviceAudio(f.input, source)).toBeNull();
    expect(f.getPending()).toEqual(location);
  });
  it('still saves audio when location cannot be read or belongs to a different session', async () => {
    for (const read of [
      async () => {
        throw new Error('location journal failed');
      },
      async () => ({ ...location, sessionId: 99 }),
    ]) {
      const f = await fixture({ read });
      expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
      expect((await f.store.list())[0]?.location).toBeUndefined();
    }
  });
  it('does not attach a still-active session to transferred audio', async () => {
    const f = await fixture({
      read: async () => ({ ...location, status: 'recording', endedAt: null }),
    });
    await f.controller.importDeviceAudio(f.input, source);
    expect((await f.store.list())[0]?.location).toBeUndefined();
  });
  it('retains saved audio and location when acknowledgement fails, then retries on deduplication', async () => {
    let fail = true;
    let removed = false;
    const f = await fixture({
      remove: async () => {
        if (fail) throw new Error('busy');
        removed = true;
      },
    });
    expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
    expect(removed).toBe(false);
    expect((await f.store.list())[0]?.location).toEqual(location);
    fail = false;
    expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
    expect(removed).toBe(true);
  });
  it('removes location independently and does not restore it on reimport', async () => {
    const f = await fixture();
    await f.controller.importDeviceAudio(f.input, source);
    expect(await f.controller.removeLocation(f.record.id)).toBe(true);
    expect((await f.store.list())[0]?.location).toBeNull();
    await f.controller.importDeviceAudio(f.input, source);
    expect((await f.store.list())[0]?.location).toBeNull();
    expect((await f.store.list())[0]?.audioAvailable).toBe(true);
  });
  it('does not claim deletion succeeded if native location cleanup fails', async () => {
    let fail = false;
    const f = await fixture({
      remove: async () => {
        if (fail) throw new Error('could not delete');
      },
    });
    await f.controller.importDeviceAudio(f.input, source);
    fail = true;
    expect(await f.controller.remove(f.record.id)).toBe(false);
    expect(await f.store.list()).toHaveLength(1);
  });
});

it('does not report location removed until previous metadata versions are purged', async () => {
  const f = await fixture();
  await f.controller.importDeviceAudio(f.input, source);
  const remove = f.files.remove;
  let blocked = true;
  f.files.remove = async (path, directory) => {
    if (blocked && /metadata-\d+\.json$/.test(path)) throw new Error('file locked');
    return remove(path, directory);
  };
  expect(await f.controller.removeLocation(f.record.id)).toBe(false);
  blocked = false;
  expect(await f.controller.removeLocation(f.record.id)).toBe(true);
  const versions = (await f.files.list(`${f.root}/${f.record.id}`)).filter((entry) =>
    entry.name.startsWith('metadata-'),
  );
  expect(versions).toHaveLength(1);
  expect(
    JSON.parse(await f.files.readText(`${f.root}/${f.record.id}/${versions[0]!.name}`)).location,
  ).toBeNull();
});

it('shows a pending removal after reload and recovers the old metadata purge on a later read', async () => {
  const f = await fixture();
  await f.controller.importDeviceAudio(f.input, source);
  const remove = f.files.remove;
  let blocked = true;
  f.files.remove = async (path, directory) => {
    if (blocked && /metadata-\d+\.json$/.test(path)) throw new Error('file locked');
    return remove(path, directory);
  };
  expect(await f.controller.removeLocation(f.record.id)).toBe(false);
  await f.controller.reload();
  const pending = (await f.store.list())[0];
  expect(pending?.location).toBeNull();
  expect(pending?.locationRemovalPending).toBe(true);
  expect(pending?.audioAvailable).toBe(true);
  blocked = false;
  const recovered = (await f.store.list())[0];
  expect(recovered?.locationRemovalPending).not.toBe(true);
  expect(
    (await f.files.list(`${f.root}/${f.record.id}`)).filter((entry) =>
      entry.name.startsWith('metadata-'),
    ),
  ).toHaveLength(1);
});

it('preserves native pending locations if the separate metadata write fails after audio saved', async () => {
  const f = await fixture();
  const update = f.store.update;
  f.store.update = async () => {
    throw new Error('metadata locked');
  };
  expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
  expect(f.getPending()).toEqual(location);
  expect((await f.store.list())[0]?.audioAvailable).toBe(true);
  f.store.update = update;
  expect(await f.controller.importDeviceAudio(f.input, source)).toBe(f.record.id);
  expect((await f.store.list())[0]?.location).toEqual(location);
  expect(f.getPending()).toBeNull();
});

it('accepts fractional millisecond timestamps supplied by iOS CLLocation', () => {
  expect(
    readRecordingLocation(
      {
        ...location,
        startedAt: startedAt + 0.125,
        points: [{ ...location.points[0], capturedAt: startedAt + 1000.125 }],
      },
      42,
    ),
  ).not.toBeNull();
});

it('recovers a pending location on library reload after an interrupted metadata save', async () => {
  const f = await fixture();
  const update = f.store.update;
  f.store.update = async () => {
    throw new Error('metadata busy');
  };
  await f.controller.importDeviceAudio(f.input, source);
  expect((await f.store.list())[0]?.location).toBeUndefined();
  f.store.update = update;
  await f.controller.reload();
  expect((await f.store.list())[0]?.location).toEqual(location);
});

it('recovers a pending location even after more than 100 newer imports without GPS', async () => {
  const f = await fixture();
  const older = { ...f.record, source, importedAt: '2026-01-01T00:00:00Z' };
  const newer = Array.from({ length: 101 }, (_, index) => ({
    ...f.record,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    source: { ...source, sessionId: 100 + index },
  }));
  f.store.readLibrary = async () => ({ recordings: [older, ...newer], unavailableCount: 0 });
  let attached = false;
  f.store.update = async (id, patch) => {
    if (id === older.id && patch.location) attached = true;
    return { ...older, ...patch };
  };
  await f.controller.reload();
  expect(attached).toBe(true);
});
