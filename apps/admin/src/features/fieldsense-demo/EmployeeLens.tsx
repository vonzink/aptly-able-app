import { useState } from 'react';
import { units } from './data/fleet';
import { jobs } from './data/schedules';
import { moments } from './data/moments';
import { coaching } from './data/coaching';
import { employeeStats } from './data/employee-stats';
import { Avatar, BatteryRing, Dot, Meter, Panel, Pill, Segments, Stat } from './components';
import {
  batteryTone,
  colors,
  statusTone,
  storagePercent,
  storageTone,
  unitIndex,
} from './presentation';
import { Icon } from './Icons';
import { ReportButton } from './ReportPreview';
import type { DemoReport } from './use-demo-report';
import type { Preview } from './types';
import s from './demo.module.css';
import v from './employee.module.css';

type Sort = 'flags' | 'battery' | 'name';
const sortOptions: readonly { id: Sort; label: string }[] = [
  { id: 'flags', label: 'Most flags' },
  { id: 'battery', label: 'Battery' },
  { id: 'name', label: 'A–Z' },
];
const hourLabel = (hour: number) => `${hour % 12 || 12}${hour >= 12 ? 'p' : 'a'}`;

export function EmployeeLens({
  selected,
  select,
  seconds,
  report,
  open,
}: {
  selected: number;
  select: (index: number) => void;
  seconds: number;
  report: DemoReport;
  open: (preview: Preview) => void;
}) {
  const [sort, setSort] = useState<Sort>('flags');
  const roster = [...units].sort((a, b) =>
    sort === 'flags'
      ? b.flags - a.flags
      : sort === 'battery'
        ? a.battery - b.battery
        : a.name.localeCompare(b.name),
  );
  const unit = units[selected]!;
  const stats = employeeStats[selected]!;
  const today = jobs[selected] ?? [];
  const clips = moments[selected] ?? [];
  const nowPosition = Math.min(100, ((14 + 41 / 60 + seconds / 3600 - 7) / 11) * 100);
  return (
    <div className={v.employeeLayout}>
      <aside className={v.roster} aria-label="Employee roster">
        <div className={v.rosterHeading}>
          <h2>Employees</h2>
          <Segments label="Sort employees" items={sortOptions} value={sort} onChange={setSort} />
        </div>
        <div className={v.rosterList}>
          {roster.map((person) => (
            <button
              key={person.device}
              aria-pressed={person.name === unit.name}
              onClick={() => select(unitIndex(person.name))}
            >
              <Avatar name={person.name} index={unitIndex(person.name)} />
              <span>
                <strong>
                  <Dot tone={statusTone(person.status)} />
                  {person.name}
                </strong>
                <small>
                  {person.role} · {person.truck}
                </small>
              </span>
              <span className={v.rosterNumbers}>
                <b style={{ color: colors[batteryTone(person.battery)] }}>{person.battery}%</b>
                <small style={{ color: person.flags ? colors.amber : colors.green }}>
                  {person.flags ? `${person.flags} flag${person.flags === 1 ? '' : 's'}` : 'clean'}
                </small>
              </span>
            </button>
          ))}
        </div>
        <p>Showing 8 of 8 employees</p>
      </aside>
      <div className={s.view}>
        <div className={s.pageHeading}>
          <div className={v.employeeIdentity}>
            <Avatar name={unit.name} index={selected} size="large" />
            <div>
              <div className={v.employeeName}>
                <h1>{unit.name}</h1>
                <Pill tone={statusTone(unit.status)}>
                  <Dot tone={statusTone(unit.status)} />
                  {unit.status}
                </Pill>
              </div>
              <p>
                {unit.role} · {unit.truck} · Plaud {unit.device}
                <br />
                Last sync {unit.lastSync}
              </p>
            </div>
          </div>
          <ReportButton report={report} open={open} employee={unit.name} />
        </div>
        <div className={v.employeeStats}>
          <Stat
            label="Captured today"
            value={stats[0]}
            sub={`${unit.visits} site visit${unit.visits === 1 ? '' : 's'}`}
            subTone="muted"
          />
          <Stat
            label="Coverage"
            value={stats[1]}
            sub="of scheduled job time"
            tone="green"
            subTone="muted"
          />
          <Stat
            label="Opportunity found"
            value={stats[2]}
            sub="flagged by AI this week"
            tone="amber"
            subTone="muted"
          />
          <Stat
            label="Next-step asked"
            value={stats[3]}
            sub="visits ending in a commitment"
            tone="blue"
            subTone="muted"
          />
        </div>
        <Panel
          title="Today's schedule · capture coverage"
          action={
            <div className={v.legend}>
              <span>
                <Dot tone="green" />
                Captured
              </span>
              <span>
                <Dot tone="blue" />
                Scheduled
              </span>
              <span>
                <Dot tone="red" />
                No capture
              </span>
            </div>
          }
        >
          <div
            className={v.timelineViewport}
            role="region"
            aria-label="Sample schedule, scroll horizontally on smaller screens"
            tabIndex={0}
          >
            <div className={v.timeline}>
              {Array.from({ length: 12 }, (_, index) => (
                <div className={v.hour} key={index} style={{ left: `${(index / 11) * 100}%` }}>
                  <span>{hourLabel(index + 7)}</span>
                </div>
              ))}
              {today.map((job, index) => (
                <button
                  key={job.label}
                  className={`${v.job} ${v[job.t]}`}
                  style={{
                    left: `${((job.s - 7) / 11) * 100}%`,
                    width: `${((job.e - job.s) / 11) * 100}%`,
                    top: 36 + (index % 2) * 49,
                  }}
                  onClick={() =>
                    open({
                      kind: 'placeholder',
                      title: job.label,
                      description: `${unit.name} · ${job.meta}. This is an example schedule entry; appointments and calendars are not connected.`,
                    })
                  }
                  aria-label={`${job.label}, ${job.meta}`}
                >
                  <strong>{job.label}</strong>
                  <small>{job.meta}</small>
                </button>
              ))}
              <div className={v.nowLine} style={{ left: `${nowPosition}%` }}>
                <span>demo now</span>
              </div>
            </div>
          </div>
        </Panel>
        <div className={v.employeeBottom}>
          <Panel title={`Device health · Plaud ${unit.device}`}>
            <div className={v.healthDetails}>
              <BatteryRing value={unit.battery} large />
              <div>
                <Meter
                  label="Storage"
                  detail={`${unit.used.toFixed(1)} / 64 GB`}
                  value={storagePercent(unit)}
                  tone={storageTone(storagePercent(unit))}
                />
                <dl>
                  <div>
                    <dt>Recording headroom</dt>
                    <dd>{((unit.total - unit.used) * 0.62).toFixed(1)}h</dd>
                  </div>
                  <div>
                    <dt>Firmware</dt>
                    <dd>{unit.firmware}</dd>
                  </div>
                  <div>
                    <dt>Unsynced clips</dt>
                    <dd
                      style={{
                        color:
                          unit.unsynced > 2
                            ? colors.red
                            : unit.unsynced
                              ? colors.amber
                              : colors.green,
                      }}
                    >
                      {unit.unsynced}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <ul className={v.coaching}>
              {(coaching[selected] ?? []).map((item) => (
                <li key={item.label}>
                  <Pill
                    tone={item.tone === 'ok' ? 'green' : item.tone === 'warn' ? 'amber' : 'red'}
                  >
                    {item.label}
                  </Pill>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="AI-flagged moments" action={<Pill tone="blue">{clips.length} clips</Pill>}>
            <ul className={v.moments}>
              {clips.map((moment) => (
                <li key={moment.customer}>
                  <div>
                    <Pill
                      tone={
                        moment.kind === 'missed'
                          ? 'amber'
                          : moment.kind === 'won'
                            ? 'green'
                            : 'violet'
                      }
                    >
                      {moment.kind}
                    </Pill>
                    <strong>{moment.customer}</strong>
                    <b style={{ color: moment.kind === 'won' ? colors.green : colors.amber }}>
                      {moment.value}
                    </b>
                  </div>
                  <blockquote>{moment.quote}</blockquote>
                  <footer>
                    <button
                      className={s.textButton}
                      onClick={() => open({ kind: 'moment', employee: unit.name, moment })}
                    >
                      <Icon name="play" size={12} />
                      {moment.play}
                    </button>
                    <span>{moment.action}</span>
                  </footer>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
