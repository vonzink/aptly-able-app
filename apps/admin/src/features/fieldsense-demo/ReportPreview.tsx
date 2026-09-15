import { useEffect, useRef } from 'react';
import type { Preview } from './types';
import type { DemoReport } from './use-demo-report';
import { Icon } from './Icons';
import { Pill } from './components';
import { employeeStats } from './data/employee-stats';
import { coaching } from './data/coaching';
import { unitIndex } from './presentation';
import s from './demo.module.css';
import d from './preview.module.css';

export function ReportButton({
  report,
  open,
  employee,
}: {
  report: DemoReport;
  open: (preview: Preview) => void;
  employee?: string;
}) {
  const ready = report.phase === 'ready' && report.employee === (employee ?? null);
  return (
    <button
      className={s.primaryButton}
      disabled={report.phase === 'running'}
      onClick={() =>
        ready
          ? open({
              kind: 'report',
              title: report.title,
              ...(report.employee ? { employee: report.employee } : {}),
            })
          : report.run(employee ?? null)
      }
    >
      <Icon name="sparkle" size={16} />
      {report.phase === 'running'
        ? 'Analyzing sample data…'
        : ready
          ? 'View sample report'
          : employee
            ? `Run AI report on ${employee.split(' ')[0]}`
            : 'Run AI Report'}
    </button>
  );
}
export function ReportProgress({ report }: { report: DemoReport }) {
  const stage =
    report.percent < 30
      ? report.employee
        ? `Reviewing ${report.employee.split(' ')[0]}’s sample recordings…`
        : 'Reviewing 41 sample recordings…'
      : report.percent < 60
        ? 'Scoring sample opportunities…'
        : report.percent < 85
          ? 'Matching quotes to sample evidence…'
          : 'Composing sample leadership summary…';
  return report.phase === 'running' ? (
    <div className={s.reportProgress}>
      <div>
        <span>{stage}</span>
        <b>{report.percent}%</b>
      </div>
      <div
        className={s.progressTrack}
        role="progressbar"
        aria-label="Sample report generation"
        aria-valuenow={report.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${report.percent}%` }} />
      </div>
    </div>
  ) : null;
}

export function PreviewDialog({ preview, close }: { preview: Preview; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const title = preview.kind === 'moment' ? preview.moment.customer : preview.title;
  const employee = preview.kind === 'report' ? preview.employee : undefined;
  const stats = employee ? employeeStats[unitIndex(employee)]! : null;
  return (
    <dialog
      ref={ref}
      className={d.dialog}
      onCancel={close}
      aria-labelledby="demo-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={d.dialogContent}>
        <header>
          <Pill tone="blue">Demo preview</Pill>
          <button className={s.iconButton} onClick={close} aria-label="Close preview">
            <Icon name="close" />
          </button>
        </header>
        <h2 id="demo-dialog-title">{title}</h2>
        {preview.kind === 'moment' ? (
          <>
            <p>{preview.employee} · Sample recording</p>
            <div className={d.samplePlayer}>
              <Icon name="headphones" size={25} />
              <span>
                Recording preview
                <small>
                  {preview.moment.play.replace('Play at ', 'Timestamp ')} · No audio in this demo
                </small>
              </span>
              <span className={d.staticWave} aria-hidden="true">
                {[12, 23, 15, 31, 20, 38, 24, 16, 28, 13, 21, 9].map((height, index) => (
                  <i key={index} style={{ height }} />
                ))}
              </span>
            </div>
            <h3>Conversation excerpt</h3>
            <blockquote>{preview.moment.quote}</blockquote>
            <div className={d.dialogFact}>
              <Pill
                tone={
                  preview.moment.kind === 'won'
                    ? 'green'
                    : preview.moment.kind === 'coach'
                      ? 'violet'
                      : 'amber'
                }
              >
                {preview.moment.kind}
              </Pill>
              <strong>{preview.moment.value}</strong>
            </div>
            <h3>Suggested next step</h3>
            <p>{preview.moment.action}</p>
          </>
        ) : preview.kind === 'report' ? (
          <>
            <p>{employee ?? 'Cimarron Air & Heat'} · September 8–14, 2026</p>
            {employee && stats ? (
              <>
                <div className={d.reportSummary}>
                  <div>
                    <small>Opportunity found</small>
                    <strong>{stats[2]}</strong>
                  </div>
                  <div>
                    <small>Capture coverage</small>
                    <strong>{stats[1]}</strong>
                  </div>
                  <div>
                    <small>Captured today</small>
                    <strong>{stats[0]}</strong>
                  </div>
                </div>
                <h3>Coaching summary</h3>
                {(coaching[unitIndex(employee)] ?? []).map((item) => (
                  <section key={item.label}>
                    <h3>{item.label}</h3>
                    <p>{item.body}</p>
                  </section>
                ))}
              </>
            ) : (
              <>
                <div className={d.reportSummary}>
                  <div>
                    <small>Opportunity at risk</small>
                    <strong>$84,600</strong>
                  </div>
                  <div>
                    <small>Recovered</small>
                    <strong>$41,200</strong>
                  </div>
                  <div>
                    <small>Sample recordings</small>
                    <strong>41</strong>
                  </div>
                </div>
                <h3>Leadership summary</h3>
                <p>
                  The sample conversations show strong technical explanations and missed
                  opportunities to turn customer interest into a named next step.
                </p>
                <h3>Three actions to prioritize</h3>
                <ol>
                  <li>
                    <strong>Follow up with Arbor Dental.</strong> Ana’s customer requested a
                    four-office bid before a board meeting. Assign an owner to the $31,600
                    opportunity.
                  </li>
                  <li>
                    <strong>Capture adjacent scope at Bell Plaza.</strong> Marcus heard interest in
                    two more rooftop units. Prepare the $22,400 proposal.
                  </li>
                  <li>
                    <strong>Restore Hal’s capture coverage.</strong> His sample unit is offline with
                    12% battery and seven clips awaiting sync.
                  </li>
                </ol>
              </>
            )}
            <p className={d.demoDisclaimer}>
              Illustrative report from sample data. No recordings were accessed, and no AI
              processing was performed.
            </p>
          </>
        ) : (
          <p>{preview.description}</p>
        )}
        <footer>
          <button className={s.primaryButton} onClick={close}>
            Back to dashboard
          </button>
        </footer>
      </div>
    </dialog>
  );
}
