import type { RecorderSummary } from '@aptly/contracts';

import type { RecorderAdapter, RecorderAdapterEvent } from './recorder-adapter';

const simulatedRecorder: RecorderSummary = {
  id: 'b6869d8b-bb23-47d7-a727-cabcad0b00b6',
  name: 'Plaud NotePin S',
  model: 'notepins',
  serialSuffix: '4812',
  batteryPercent: 82,
  storageFreeBytes: 18_000_000_000,
  storageTotalBytes: 32_000_000_000,
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export function createMockRecorderAdapter(): RecorderAdapter {
  const listeners = new Set<(event: RecorderAdapterEvent) => void>();
  let scanVersion = 0;

  return {
    mode: 'mock',
    async scan() {
      const ownVersion = ++scanVersion;
      await wait(650);
      return ownVersion === scanVersion ? [simulatedRecorder] : [];
    },
    cancelScan() {
      scanVersion += 1;
    },
    async connect(recorder) {
      await wait(850);
      return recorder;
    },
    async disconnect() {
      await wait(250);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
