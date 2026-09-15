import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Tone } from './types';
import { avatars, batteryTone, colors, initials } from './presentation';
import s from './demo.module.css';

export const tint = (tone: Tone): CSSProperties => ({ '--tone': colors[tone] }) as CSSProperties;
export function Pill({ children, tone = 'blue' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={s.pill} style={tint(tone)}>
      {children}
    </span>
  );
}
export function Dot({ tone = 'blue', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span aria-hidden="true" className={`${s.dot} ${pulse ? s.pulse : ''}`} style={tint(tone)} />
  );
}
export function Avatar({
  name,
  index,
  size = 'normal',
}: {
  name: string;
  index: number;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span
      aria-hidden="true"
      className={`${s.avatar} ${s[size]}`}
      style={{ background: avatars[index % avatars.length] }}
    >
      {initials(name)}
    </span>
  );
}
export function BatteryRing({ value, large = false }: { value: number; large?: boolean }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className={`${s.battery} ${large ? s.batteryLarge : ''}`}
      role="meter"
      aria-label="Battery remaining"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      style={tint(batteryTone(value))}
    >
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle
          cx="23"
          cy="23"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,.1)"
          strokeWidth="3.5"
        />
        <circle
          className={s.batteryArc}
          cx="23"
          cy="23"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform="rotate(-90 23 23)"
        />
      </svg>
      <span>
        {value}%{large && <small>Battery</small>}
      </span>
    </div>
  );
}
export function Meter({
  label,
  value,
  tone = 'blue',
  detail,
}: {
  label: string;
  value: number;
  tone?: Tone;
  detail?: string;
}) {
  return (
    <div className={s.meterGroup} style={tint(tone)}>
      <div className={s.meterLabels}>
        <span>{label}</span>
        {detail && <span>{detail}</span>}
      </div>
      <div
        className={s.meter}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.max(0, Math.min(100, value))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={detail ?? `${value}%`}
      >
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
export function Panel({
  title,
  action,
  children,
  className = '',
  icon,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`${s.panel} ${className}`} aria-labelledby={id}>
      <header className={s.panelHeader}>
        <h2 id={id}>
          {icon}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  subTone = 'green',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub: string;
  tone?: Tone;
  subTone?: Tone;
}) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <div className={s.statValue} style={tone ? { color: colors[tone] } : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <span className={s.statSub} style={{ color: colors[subTone] }}>
        {sub}
      </span>
    </div>
  );
}
export function Segments<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={s.segments} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
