export interface RecorderStorage {
  totalBytes: number;
  freeBytes: number;
}

export interface PlaudStatusEvents {
  batteryState: { batteryPercent: number; charging?: boolean };
  storageState: RecorderStorage;
}

/** Read-only device telemetry, independent of pairing and recording transfer. */
export interface PlaudStatusPort {
  readonly isAvailable: boolean;
  /** Dispatches requests; readings arrive through the listeners, not this promise. */
  request(): Promise<void>;
  addListener<K extends keyof PlaudStatusEvents>(
    name: K,
    listener: (event: PlaudStatusEvents[K]) => void,
  ): { remove(): void };
}
