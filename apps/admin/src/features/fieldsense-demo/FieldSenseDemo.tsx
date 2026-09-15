import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoView, Preview } from './types';
import { Brand, Icon, type IconName } from './Icons';
import { Dot, Meter, Pill } from './components';
import { demoTime } from './presentation';
import { MissionControl } from './MissionControl';
import { EmployeeLens } from './EmployeeLens';
import { RevenueRadar } from './RevenueRadar';
import { PreviewDialog, ReportProgress } from './ReportPreview';
import { useDemoSimulation } from './use-demo-simulation';
import { useDemoReport } from './use-demo-report';
import s from './demo.module.css';
import layout from './shell.module.css';

const tabs = [
  { id: 'mission', label: 'Mission Control', tone: 'green' },
  { id: 'employee', label: 'Employee Lens', tone: 'blue' },
  { id: 'revenue', label: 'Revenue Radar', tone: 'amber' },
] as const;
const navigation: { label: string; icon: IconName; view?: DemoView }[] = [
  { label: 'Reports', icon: 'report', view: 'revenue' },
  { label: 'Calls', icon: 'phone' },
  { label: 'Meetings', icon: 'calendar' },
  { label: 'Leads', icon: 'dollar' },
  { label: 'Stores', icon: 'store' },
  { label: 'Agents', icon: 'users', view: 'employee' },
  { label: 'Customers', icon: 'contact' },
];

export default function FieldSenseDemo() {
  const [view, setView] = useState<DemoView>('mission');
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const changedView = useRef(false);
  const simulation = useDemoSimulation();
  const report = useDemoReport();
  const activeTab = tabs.find((tab) => tab.id === view)!;
  useEffect(() => {
    const original = document.title;
    document.title = 'Field Sense · Dashboard demo';
    return () => {
      document.title = original;
    };
  }, []);
  const navigate = useCallback((next: DemoView) => {
    changedView.current = true;
    setView(next);
    setMenuOpen(false);
  }, []);
  const selectEmployee = useCallback(
    (index: number) => {
      setSelected(index);
      navigate('employee');
    },
    [navigate],
  );
  useEffect(() => {
    if (changedView.current) {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [view]);
  const placeholder = (title: string, description: string) =>
    setPreview({ kind: 'placeholder', title, description });
  return (
    <div className={s.demo} data-motion={simulation.running ? 'running' : 'paused'}>
      <a className={layout.skipLink} href="#fieldsense-content">
        Skip to dashboard content
      </a>
      <div className={layout.mobileBar}>
        <Brand />
        <button
          className={s.iconButton}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="demo-sidebar"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
      </div>
      <aside
        id="demo-sidebar"
        className={`${layout.sidebar} ${menuOpen ? layout.sidebarOpen : ''}`}
      >
        <div className={layout.brand}>
          <Brand />
        </div>
        <nav aria-label="CallSense demo navigation" className={layout.primaryNav}>
          {navigation.map((item) => (
            <button
              key={item.label}
              onClick={() =>
                item.view
                  ? navigate(item.view)
                  : placeholder(
                      item.label,
                      `${item.label} would be part of the wider CallSense workspace. Explore Mission Control, Employee Lens and Revenue Radar in this Field Sense demo.`,
                    )
              }
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className={layout.divider} />
        <div className={layout.fieldsenseMark}>
          <Icon name="plane" size={17} />
          Fieldsense
        </div>
        <nav aria-label="Field Sense views" className={layout.viewNav}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={view === tab.id ? 'page' : undefined}
              onClick={() => navigate(tab.id)}
            >
              <Dot tone={tab.tone} />
              {tab.label}
            </button>
          ))}
        </nav>
        {view === 'mission' ? (
          <section className={layout.sidebarPanel} aria-label="Sample fleet summary">
            <h2>Fleet</h2>
            <dl>
              <div>
                <dt>Devices paired</dt>
                <dd>8</dd>
              </div>
              <div>
                <dt>Recording</dt>
                <dd className={layout.green}>4</dd>
              </div>
              <div>
                <dt>Needs attention</dt>
                <dd className={layout.amber}>2</dd>
              </div>
              <div>
                <dt>Captured today</dt>
                <dd>21.4 h</dd>
              </div>
            </dl>
          </section>
        ) : view === 'employee' ? (
          <section className={layout.sidebarPanel}>
            <h2>Report workflow</h2>
            <div className={layout.primaryNav}>
              <button
                onClick={() =>
                  placeholder(
                    'Upload resources',
                    'In the connected product, recordings and supporting documents would enter here. This display-only demo does not select, read or upload any files.',
                  )
                }
              >
                <Icon name="upload" size={16} />
                Upload Resources
              </button>
              <button
                onClick={() =>
                  placeholder(
                    'Transcribe audio',
                    'The demo illustrates sample transcripts. Transcription and real recordings are not connected.',
                  )
                }
              >
                <Icon name="mic" size={16} />
                Transcribe Audio
              </button>
              <button
                onClick={() => {
                  report.run();
                  navigate('revenue');
                }}
              >
                <Icon name="report" size={16} />
                Generate Report
              </button>
            </div>
          </section>
        ) : (
          <section className={layout.sidebarPanel}>
            <h2>This week</h2>
            <Meter label="Capture compliance" value={94} detail="94%" tone="green" />
            <Meter label="Next-step asked" value={61} detail="61%" tone="amber" />
            <Meter label="Quote follow-up" value={38} detail="38%" tone="red" />
          </section>
        )}
        <footer>
          <span>Field Sense concept demo</span>
          <span>© 2026 Vantedges LLC</span>
        </footer>
      </aside>
      <div className={layout.workspace}>
        <header className={layout.topbar}>
          <div className={layout.topbarLeft}>
            <Pill tone="green">
              <Dot tone="green" pulse />
              {simulation.running ? 'Demo live' : 'Demo paused'}
            </Pill>
            <time className={layout.clock}>{demoTime(simulation.seconds)} CT · 405 region</time>
          </div>
          <button
            className={layout.company}
            onClick={() =>
              placeholder(
                'Cimarron Air & Heat',
                'This is the sample company used throughout the Field Sense concept. All employees, recordings, schedules and revenue figures shown here are demo data.',
              )
            }
          >
            <Icon name="building" size={16} />
            <span>Cimarron Air & Heat</span>
            <Icon name="down" size={13} />
            <span className={layout.companyAvatar} aria-hidden="true">
              CA
            </span>
          </button>
        </header>
        <div className={layout.demoBanner}>
          <span>
            <Pill tone="blue">Demo</Pill>
            <span>Explore the concept. All data and activity are simulated.</span>
          </span>
          <button
            className={s.textButton}
            onClick={simulation.toggle}
            aria-pressed={!simulation.running}
          >
            <Icon name={simulation.running ? 'pause' : 'play'} size={13} />
            {simulation.running ? 'Pause activity' : 'Resume activity'}
          </button>
        </div>
        {view !== 'revenue' && <ReportProgress report={report} />}
        <main
          id="fieldsense-content"
          ref={mainRef}
          tabIndex={-1}
          className={layout.main}
          aria-label={activeTab.label}
        >
          {view === 'mission' ? (
            <MissionControl
              seconds={simulation.seconds}
              selectEmployee={selectEmployee}
              report={report}
              open={setPreview}
            />
          ) : view === 'employee' ? (
            <EmployeeLens
              selected={selected}
              select={setSelected}
              seconds={simulation.seconds}
              report={report}
              open={setPreview}
            />
          ) : (
            <RevenueRadar report={report} open={setPreview} selectEmployee={selectEmployee} />
          )}
        </main>
        <p className={s.srOnly} role="status">
          {report.phase === 'ready'
            ? 'Sample report ready. Select View sample report to open it.'
            : report.phase === 'running'
              ? 'Generating a simulated report.'
              : ''}
        </p>
      </div>
      {preview && <PreviewDialog preview={preview} close={() => setPreview(null)} />}
    </div>
  );
}
