import { useState } from 'react';
import { depts, missed, reports, week } from './data/revenue';
import { units } from './data/fleet';
import { Avatar, Dot, Meter, Panel, Pill, Segments } from './components';
import { colors, statusTone, storagePercent, storageTone, unitIndex } from './presentation';
import { Icon } from './Icons';
import { ReportButton, ReportProgress } from './ReportPreview';
import type { DemoReport } from './use-demo-report';
import type { Preview } from './types';
import s from './demo.module.css';
import v from './revenue.module.css';

type Period = 'week' | 'month' | 'quarter';
const periods: readonly { id: Period; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
];
const series = {
  week: {
    risk: '$84,600',
    recovered: '$41,200',
    range: 'Sep 8–14, 2026',
    count: 27,
    points: [78, 62, 70, 44, 52, 30, 38, 18],
    recovery: [96, 90, 86, 78, 74, 62, 58, 48],
    labels: ['Tue 8', 'Wed 9', 'Thu 10', 'Fri 11', 'Sat 12', 'Sun 13', 'Mon 14'],
  },
  month: {
    risk: '$216,400',
    recovered: '$108,600',
    range: 'September 2026',
    count: 68,
    points: [88, 70, 80, 64, 40, 50, 28, 20],
    recovery: [100, 93, 86, 84, 71, 64, 57, 46],
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
  },
  quarter: {
    risk: '$592,800',
    recovered: '$307,200',
    range: 'Jul–Sep 2026',
    count: 194,
    points: [85, 60, 65, 40, 50, 34, 25, 10],
    recovery: [99, 92, 82, 73, 69, 55, 48, 39],
    labels: ['July', 'August', 'September'],
  },
};

export function RevenueRadar({
  report,
  open,
  selectEmployee,
}: {
  report: DemoReport;
  open: (preview: Preview) => void;
  selectEmployee: (index: number) => void;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const data = series[period];
  const path = (values: number[]) =>
    values.map((value, index) => `${index * 100},${value}`).join(' ');
  return (
    <div className={s.view}>
      <div className={s.pageHeading}>
        <div>
          <h1>Revenue Radar</h1>
          <p>Turn field conversations into the next right action.</p>
        </div>
        <span className={s.smallMuted}>Reporting period {data.range}</span>
      </div>
      <div className={v.revenueTop}>
        <section className={v.revenueHero} aria-label="Sample revenue trends">
          <div className={v.heroHeading}>
            <span>
              Revenue at risk · flagged by AI {period === 'week' ? 'this week' : `this ${period}`}
            </span>
            <Segments
              label="Reporting period"
              items={periods}
              value={period}
              onChange={setPeriod}
            />
          </div>
          <div className={v.heroNumbers}>
            <strong>{data.risk}</strong>
            <span>
              <b>{data.recovered} recovered</b>
              <small>{data.count} opportunities · 8 employees</small>
            </span>
          </div>
          <svg
            className={v.revenueChart}
            viewBox="0 0 700 110"
            role="img"
            aria-label={`Illustrative ${period} trend. ${data.risk} at risk and ${data.recovered} recovered.`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="risk-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4da3ff" stopOpacity=".25" />
                <stop offset="100%" stopColor="#4da3ff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="recovered-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity=".12" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[25, 55, 85].map((y) => (
              <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="rgba(120,170,255,.09)" />
            ))}
            <polygon points={`0,110 ${path(data.points)} 700,110`} fill="url(#risk-fill)" />
            <polyline points={path(data.points)} fill="none" stroke="#4da3ff" strokeWidth="2.5" />
            <polygon points={`0,110 ${path(data.recovery)} 700,110`} fill="url(#recovered-fill)" />
            <polyline
              points={path(data.recovery)}
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          <div className={v.chartLabels}>
            {data.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className={v.legend}>
            <span>
              <Dot tone="blue" />
              At risk
            </span>
            <span>
              <Dot tone="green" />
              Recovered
            </span>
            <span>Illustrative trend</span>
          </div>
        </section>
        <Panel
          title="Where it leaks"
          action={<span className={s.smallMuted}>This week · by department</span>}
        >
          <div className={v.departments}>
            {depts.map((dept) => (
              <Meter
                key={dept.name}
                label={dept.name}
                value={dept.pct}
                detail={dept.value}
                tone={
                  dept.name === 'Equipment'
                    ? 'amber'
                    : dept.name === 'Service'
                      ? 'blue'
                      : dept.name === 'Repair'
                        ? 'green'
                        : dept.name === 'Bid'
                          ? 'violet'
                          : 'muted'
                }
              />
            ))}
          </div>
        </Panel>
      </div>
      <div className={v.revenueBottom}>
        <div className={s.stack}>
          <Panel
            title="Missed opportunities"
            action={<span className={s.smallMuted}>This week · priority first</span>}
          >
            <div
              className={v.tableViewport}
              role="region"
              tabIndex={0}
              aria-label="Sample opportunities, scroll horizontally on smaller screens"
            >
              <table className={v.opportunityTable}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Dept</th>
                    <th scope="col">What the customer asked</th>
                    <th scope="col">Value</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {missed.map((item, index) => (
                    <tr key={`${item.who}-${index}`}>
                      <td>
                        <button
                          className={v.tablePerson}
                          onClick={() => selectEmployee(unitIndex(item.who))}
                        >
                          <Avatar name={item.who} index={unitIndex(item.who)} size="small" />
                          <span>
                            <strong>{item.who}</strong>
                            <small>{item.when}</small>
                          </span>
                        </button>
                      </td>
                      <td>{item.dept}</td>
                      <td>{item.ask}</td>
                      <td className={v.money}>{item.value}</td>
                      <td>
                        <Pill
                          tone={
                            item.status === 'Open'
                              ? 'red'
                              : item.status === 'Aging'
                                ? 'amber'
                                : item.status === 'Won'
                                  ? 'green'
                                  : 'blue'
                          }
                        >
                          {item.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Fleet strip · Plaud devices"
            action={
              <div className={v.legend}>
                <span>
                  <Dot tone="green" />
                  Recording 4
                </span>
                <span>
                  <Dot tone="blue" />
                  Idle
                </span>
                <span>
                  <Dot tone="muted" />
                  Offline
                </span>
              </div>
            }
          >
            <div className={v.fleetStrip}>
              {units.map((unit) => (
                <button key={unit.device} onClick={() => selectEmployee(unitIndex(unit.name))}>
                  <span>
                    <Dot tone={statusTone(unit.status)} />
                    <strong>{unit.name.split(' ')[0]}</strong>
                    <b style={{ color: unit.battery <= 20 ? colors.red : colors.green }}>
                      {unit.battery}%
                    </b>
                  </span>
                  <Meter
                    label={`${unit.name} storage`}
                    value={storagePercent(unit)}
                    tone={storageTone(storagePercent(unit))}
                  />
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div className={s.stack}>
          <Panel title="AI reports" action={<ReportButton report={report} open={open} />}>
            <ReportProgress report={report} />
            <div className={v.reportList}>
              {report.phase === 'ready' && (
                <button
                  className={v.newReport}
                  onClick={() =>
                    open({
                      kind: 'report',
                      title: report.title,
                      ...(report.employee ? { employee: report.employee } : {}),
                    })
                  }
                >
                  <Icon name="check" />
                  <span>
                    <strong>{report.title}</strong>
                    <small>Just created · simulated report</small>
                  </span>
                  <Pill tone="green">Ready</Pill>
                </button>
              )}
              {reports.map((item) => (
                <button
                  key={item.name}
                  onClick={() =>
                    open({
                      kind: 'report',
                      title: item.name,
                      ...(item.employee ? { employee: item.employee } : {}),
                    })
                  }
                >
                  <span className={v.reportIcon}>
                    <Icon name="chart" size={22} />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <Pill tone={item.status === 'reported' ? 'blue' : 'green'}>{item.status}</Pill>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Schedule · next 5 days" action={<Icon name="calendar" size={17} />}>
            <div className={v.week}>
              {week.map((day) => (
                <div key={day.dow}>
                  <header>
                    <span>{day.dow}</span>
                    <b>{day.date}</b>
                    <small style={{ color: day.covColor }}>{day.coverage}</small>
                  </header>
                  {day.jobs.map((job) => (
                    <button
                      key={job.label}
                      style={{ borderLeftColor: job.border, background: job.bg }}
                      onClick={() =>
                        open({
                          kind: 'placeholder',
                          title: job.label,
                          description: `${day.dow}, September ${day.date} · ${job.who}. This sample schedule illustrates coverage planning; no calendar is connected.`,
                        })
                      }
                    >
                      <strong>{job.label}</strong>
                      <small>{job.who}</small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
