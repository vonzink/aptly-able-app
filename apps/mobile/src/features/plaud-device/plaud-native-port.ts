/** The connection-only surface of Plaud's event-driven native module. */
export interface PlaudNearbyDevice {
  uuid: string;
  serialNumber: string;
  name: string;
}

export interface PlaudNativeEvents {
  scanResult: { devices: PlaudNearbyDevice[] };
  scanTimeout: { reason?: string };
  connectState: { connected: boolean; failed: boolean; state: number };
  /** Optional Android progress; never a substitute for connection/bind/pen-state confirmation. */
  connectStage: { stage: string; detail: string | null };
  bind: { sn: string | null; status: number; protVersion: number };
  penState: { state: number; privacy: number; keyState: number; uDisk: number };
  depair: { status: number };
}

export interface PlaudNativePort {
  readonly isAvailable: boolean;
  initSDK(options: {
    userAccessToken: string;
    customDomain: string;
    userId: string;
  }): Promise<void>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connectBleDevice(options: { uuid: string; deviceToken: string }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  /** Normal unpair: Android clear=false; iOS clear=true. Result arrives via depair. */
  unpair(): Promise<void>;
  addListener<K extends keyof PlaudNativeEvents>(
    name: K,
    listener: (event: PlaudNativeEvents[K]) => void,
  ): { remove(): void };
}
