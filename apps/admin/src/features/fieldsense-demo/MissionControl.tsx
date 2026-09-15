import { memo, useState } from 'react';
import { units } from './data/fleet';
import { seedEvents, streamEvents } from './data/activity';
import { flags } from './data/revenue';
import { moments } from './data/moments';
import { Avatar, BatteryRing, Dot, Meter, Panel, Pill, Segments, Stat, tint } from './components';
import {
  attention,
  colors,
  demoTime,
  filterFleet,
  firstName,
  formatDuration,
  statusTone,
  storagePercent,
  storageTone,
  unitIndex,
} from './presentation';
import { Icon } from './Icons';
import { ReportButton } from './ReportPreview';
import type { DemoReport } from './use-demo-report';
import type { FleetFilter, Preview, Tone, Unit } from './types';
import s from './demo.module.css';
import v from './mission.module.css';

const filters: readonly { id: FleetFilter; label: string }[] = [
  { id: 'all', label: 'All 8' },
  { id: 'recording', label: 'Recording 4' },
  { id: 'battery', label: 'Low battery' },
  { id: 'sync', label: 'Needs sync' },
];
const feedTones: Record<string, Tone> = {
  REC: 'green',
  SYNC: 'blue',
  FLAG: 'amber',
  ALERT: 'red',
  DONE: 'green',
  AI: 'violet',
};

const DeviceCard = memo(function DeviceCard({
  unit,
  seconds,
  select,
}: {
  unit: Unit;
  seconds: number;
  select: (index: number) => void;
}) {
  const recording = unit.status === 'RECORDING';
  const tone = statusTone(unit.status);
  return (
    <button
      className={`${v.deviceCard} ${attention(unit) ? v.attentionCard : ''}`}
      style={tint(tone)}
      onClick={() => select(unitIndex(unit.name))}
      aria-label={`View ${unit.name}, ${unit.status.toLowerCase()}, battery ${unit.battery}%`}
    >
      <div className={v.deviceIdentity}>
        <Avatar name={unit.name} index={unitIndex(unit.name)} />
        <span>
          <strong>{unit.name}</strong>
          <small>{unit.role}</small>
        </span>
        <Dot tone={tone} pulse={recording} />
      </div>
      <div className={v.deviceRecording}>
        <span>
          <b>{unit.status}</b>
          <span className={v.deviceTimer}>
            {recording
              ? formatDuration(unit.base + seconds)
              : unit.status === 'SYNCING'
                ? 'uploading'
                : unit.lastSync}
          </span>
        </span>
        <span className={`${v.wave} ${!recording ? v.quietWave : ''}`} aria-hidden="true">
          {[11, 20, 15, 24, 13].map((height, index) => (
            <i key={index} style={{ height, animationDelay: `${index * 0.15}s` }} />
          ))}
        </span>
      </div>
      <div className={v.deviceHealth}>
        <BatteryRing value={unit.battery} />
        <div>
          <Meter
            label="Storage"
            detail={`${unit.used.toFixed(1)} / ${unit.total} GB`}
            value={storagePercent(unit)}
            tone={storageTone(storagePercent(unit))}
          />
          <div className={v.deviceMeta}>
            <span>{((unit.total - unit.used) * 0.62).toFixed(1)}h left</span>
            <span>{unit.truck}</span>
          </div>
        </div>
      </div>
      <div className={v.deviceFooter}>
        <span>
          {unit.visits} {unit.visits === 1 ? 'visit' : 'visits'} ·{' '}
          {unit.captured.replace(' captured', '')}
        </span>
        <span
          style={{ color: unit.flags > 1 ? colors.red : unit.flags ? colors.amber : colors.green }}
        >
          {unit.flags ? `${unit.flags} AI flag${unit.flags > 1 ? 's' : ''}` : 'clean'}
        </span>
      </div>
    </button>
  );
});

function CaptureFeed({ seconds }: { seconds: number }) {
  const added = Math.floor(seconds / 5);
  const events = Array.from({ length: Math.min(added, 6) }, (_, index) => ({
    ...streamEvents[(added - index - 1) % streamEvents.length]!,
    time: demoTime((added - index) * 5),
    key: `stream-${added - index}`,
  }))
    .concat(
      seedEvents.map((event, index) => ({
        ...event,
        time: [
          '2:41:00 PM',
          '2:38:22 PM',
          '2:31:44 PM',
          '2:24:19 PM',
          '2:16:03 PM',
          '2:09:51 PM',
          '1:58:12 PM',
          '1:47:30 PM',
        ][index]!,
        key: `seed-${index}`,
      })),
    )
    .slice(0, 9);
  return (
    <Panel
      title="Live capture feed"
      action={<span className={s.smallMuted}>{118 + added} sample events</span>}
      icon={<Dot tone="green" pulse />}
    >
      <ul className={v.feed}>
        {events.map((event) => (
          <li key={event.key}>
            <time>{event.time.replace(' PM', 'p')}</time>
            <Dot tone={feedTones[event.tag] ?? 'blue'} />
            <span>
              <b>{event.who}</b> {event.what}
            </span>
            <Pill tone={feedTones[event.tag] ?? 'blue'}>{event.tag}</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function MissionControl({
  seconds,
  selectEmployee,
  report,
  open,
}: {
  seconds: number;
  selectEmployee: (index: number) => void;
  report: DemoReport;
  open: (preview: Preview) => void;
}) {
  const [filter, setFilter] = useState<FleetFilter>('all');
  const shown = filterFleet(filter);
  return (
    <div className={s.view}>
      <div className={s.pageHeading}>
        <div>
          <h1>Mission Control</h1>
          <p>Real-time Plaud capture across 8 field units · 4 live conversations right now</p>
        </div>
        <div className={s.headingActions}>
          <Segments label="Filter fleet" items={filters} value={filter} onChange={setFilter} />
          <ReportButton report={report} open={open} />
        </div>
      </div>
      <div className={v.fleetStats}>
        <Stat label="Units in field" value={units.length} unit="paired" sub="7 of 8 online today" />
        <Stat label="Recording now" value="4" unit="live" sub="4 job sites active" tone="green" />
        <Stat label="Captured today" value="21.4" unit="hrs" sub="+3.1 hrs vs yesterday" />
        <Stat
          label="Opportunity at risk"
          value="$84.6k"
          sub="27 flags · 9 recoverable"
          tone="amber"
          subTone="amber"
        />
        <Stat label="Fleet health" value="86" unit="%" sub="2 units need attention" subTone="red" />
      </div>
      <div className={v.deviceGrid} aria-label="Sample recorder fleet">
        {shown.map((unit) => (
          <DeviceCard
            key={unit.device}
            unit={unit}
            seconds={unit.status === 'RECORDING' ? seconds : 0}
            select={selectEmployee}
          />
        ))}
      </div>
      {filter !== 'all' && (
        <p className={s.filterResult} role="status">
          Showing {shown.length} of 8 devices{' '}
          <button className={s.textButton} onClick={() => setFilter('all')}>
            Show all devices
          </button>
        </p>
      )}
      <div className={v.missionBottom}>
        <CaptureFeed seconds={seconds} />
        <Panel
          title="AI flags needing action"
          icon={<Icon name="alert" size={17} />}
          className={v.flagsPanel ?? ''}
          action={<Pill tone="amber">4 priority flags</Pill>}
        >
          <ul className={v.flags}>
            {flags.map((flag) => (
              <li key={flag.who}>
                <div>
                  <button
                    className={s.inlineButton}
                    onClick={() => selectEmployee(unitIndex(flag.who))}
                  >
                    {flag.who} <span>· {flag.dept}</span>
                  </button>
                  <strong>{flag.value}</strong>
                </div>
                <p>{flag.text}</p>
                <button
                  className={s.textButton}
                  onClick={() => {
                    const moment = moments[unitIndex(flag.who)]?.[0];
                    if (moment) open({ kind: 'moment', employee: flag.who, moment });
                  }}
                >
                  <Icon name="play" size={12} />
                  {flag.play.replace('▶ ', '')}
                  <span className={s.srOnly}> · Sample excerpt for {firstName(flag.who)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
