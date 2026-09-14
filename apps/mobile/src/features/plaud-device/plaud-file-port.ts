import type { AudioImport } from '../recordings/recording-model';

export type PlaudRecordingState = 'unknown' | 'idle' | 'recording';
export type PlaudRecorderCommand = 'start' | 'stop' | 'pause' | 'resume';

export interface PlaudRecordingFile {
  sn: string;
  sessionId: number;
  size: number;
  channels: number;
  duration: number;
}
export interface PlaudFileEvents {
  fileList: { files: PlaudRecordingFile[] };
  exportProgress: { sessionId: number; progress: number; message: string };
  recordStart: { sessionId: number; status: number };
  recordResume: { sessionId: number; status: number };
  recordStop: { sessionId: number; fileExist: boolean; fileSize: number };
  recordPause: { sessionId: number; fileExist: boolean; fileSize: number };
}
export interface PlaudFilePort {
  readonly isAvailable: boolean;
  getRecordingState(signal: AbortSignal): Promise<PlaudRecordingState>;
  getFileList(): Promise<void>;
  exportAudio(sessionId: number): Promise<{ sessionId: number; outputPath: string }>;
  controlRecorder?(command: PlaudRecorderCommand, sessionId: number | null): Promise<void>;
  wifi?: {
    start(): Promise<void>;
    stop(): Promise<void>;
    exportAudio(sessionId: number): Promise<{ sessionId: number; outputPath: string }>;
  };
  addListener<K extends keyof PlaudFileEvents>(
    name: K,
    listener: (event: PlaudFileEvents[K]) => void,
  ): { remove(): void };
  readExport(outputPath: string): Promise<AudioImport>;
  removeExport(outputPath: string): Promise<void>;
}
