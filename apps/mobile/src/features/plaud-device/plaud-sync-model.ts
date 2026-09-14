import type { PlaudRecorderCommand } from './plaud-file-port';

export interface PlaudSyncSnapshot {
  phase:
    | 'unavailable' | 'waiting' | 'checking' | 'connecting-wifi'
    | 'syncing' | 'recording' | 'idle' | 'error';
  progress: number | null;
  message: string | null;
  activity: 'unknown' | 'idle' | 'recording' | 'paused';
  sessionId: number | null;
  command: PlaudRecorderCommand | null;
  transport: 'bluetooth' | 'wifi';
  wifiAvailable: boolean;
  controlsAvailable: boolean;
  completed: number;
  total: number;
  cancelling: boolean;
  busy: boolean;
  wifiQueued: boolean;
}

