export type DemoView = 'mission' | 'employee' | 'revenue';
export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'muted';
export type FleetFilter = 'all' | 'recording' | 'battery' | 'sync';
export type Unit = {
  name: string;
  role: string;
  truck: string;
  device: string;
  status: 'RECORDING' | 'IDLE' | 'SYNCING' | 'OFFLINE';
  battery: number;
  used: number;
  total: number;
  base: number;
  visits: number;
  captured: string;
  flags: number;
  firmware: string;
  unsynced: number;
  lastSync: string;
};
export type FeedEvent = {
  who: string;
  what: string;
  tag: 'REC' | 'SYNC' | 'FLAG' | 'ALERT' | 'DONE' | 'AI';
};
export type Job = { s: number; e: number; label: string; meta: string; t: 'cap' | 'sch' | 'gap' };
export type Moment = {
  kind: 'missed' | 'won' | 'coach';
  customer: string;
  value: string;
  quote: string;
  play: string;
  action: string;
};
export type Coaching = { label: string; tone: 'ok' | 'warn' | 'bad'; body: string };
export type EmployeeStats = readonly [
  captured: string,
  coverage: string,
  opportunity: string,
  commitments: string,
];
export type Flag = { who: string; dept: string; value: string; text: string; play: string };
export type Department = { name: string; value: string; pct: number; color: string };
export type Opportunity = {
  who: string;
  when: string;
  dept: string;
  ask: string;
  value: string;
  status: string;
  bg: string;
  color: string;
  initials: string;
  avatarBg: string;
};
export type SampleReport = {
  employee?: string;
  name: string;
  meta: string;
  status: string;
  bg: string;
  color: string;
};
export type ScheduleDay = {
  dow: string;
  date: string;
  coverage: string;
  covColor: string;
  jobs: { label: string; who: string; bg: string; border: string }[];
};
export type Preview =
  | { kind: 'moment'; employee: string; moment: Moment }
  | { kind: 'report'; title: string; employee?: string }
  | { kind: 'placeholder'; title: string; description: string };
