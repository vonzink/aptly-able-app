export interface LocationContext {
  actorId: string | null;
  serial: string | null;
}
export interface LocationSource {
  actorId: string;
  serial: string;
  sessionId: number;
}
export interface LocationStatus {
  enabled: boolean;
  permission: 'undetermined' | 'denied' | 'foreground' | 'background';
  backgroundReady: boolean;
  capturing: boolean;
  reason:
    | 'off'
    | 'ready'
    | 'disconnected'
    | 'permission'
    | 'background'
    | 'capturing'
    | 'interrupted'
    | 'storage'
    | 'unavailable';
}
export interface RecordingLocationArchive {
  read(source: LocationSource): Promise<unknown>;
  remove(source: LocationSource): Promise<void>;
  clearActor(actorId: string): Promise<void>;
}
export interface RecordingLocationPort extends RecordingLocationArchive {
  readonly available: boolean;
  setContext(context: LocationContext): Promise<void>;
  getStatus(): Promise<LocationStatus>;
  setEnabled(enabled: boolean): Promise<LocationStatus>;
  requestBackground(): Promise<LocationStatus>;
  subscribe(listener: (status: LocationStatus) => void): () => void;
}
export const unavailableLocationStatus: LocationStatus = {
  enabled: false,
  permission: 'undetermined',
  backgroundReady: false,
  capturing: false,
  reason: 'unavailable',
};
