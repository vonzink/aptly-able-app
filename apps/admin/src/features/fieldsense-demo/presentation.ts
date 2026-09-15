import type { FleetFilter, Tone, Unit } from './types';
import { units } from './data/fleet';

export const colors: Record<Tone, string> = {
  green: '#34d399',
  blue: '#4da3ff',
  amber: '#fbbf24',
  red: '#f87171',
  violet: '#c4b5fd',
  muted: '#91a8c7',
};
export const avatars = [
  '#7dd3fc',
  '#6ee7b7',
  '#fcd34d',
  '#c4b5fd',
  '#fda4af',
  '#93c5fd',
  '#5eead4',
  '#fdba74',
];
export const initials = (name: string) =>
  name
    .split(' ')
    .map((word) => word[0])
    .join('');
export const firstName = (name: string) => name.split(' ')[0];
export const unitIndex = (name: string) =>
  Math.max(
    0,
    units.findIndex((unit) => unit.name === name),
  );
export const statusTone = (status: Unit['status']): Tone =>
  (({ RECORDING: 'green', IDLE: 'blue', SYNCING: 'violet', OFFLINE: 'muted' }) as const)[status];
export const batteryTone = (value: number): Tone =>
  value <= 20 ? 'red' : value <= 40 ? 'amber' : 'green';
export const storageTone = (percent: number): Tone =>
  percent >= 90 ? 'red' : percent >= 70 ? 'amber' : 'blue';
export const storagePercent = (unit: Unit) => Math.round((unit.used / unit.total) * 100);
export const attention = (unit: Unit) => unit.battery <= 20 || storagePercent(unit) >= 90;
export const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
};
export const demoTime = (seconds: number) => {
  const minutes = 14 * 60 + 41 + Math.floor(seconds / 60);
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
export function filterFleet(filter: FleetFilter) {
  return units.filter((unit) =>
    filter === 'recording'
      ? unit.status === 'RECORDING'
      : filter === 'battery'
        ? unit.battery <= 40
        : filter === 'sync'
          ? unit.unsynced > 0
          : true,
  );
}
