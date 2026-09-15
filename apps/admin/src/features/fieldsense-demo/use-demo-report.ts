import { useEffect, useState } from 'react';

type ReportState = {
  phase: 'idle' | 'running' | 'ready';
  percent: number;
  title: string;
  employee: string | null;
};
export function useDemoReport() {
  const [state, setState] = useState<ReportState>({
    phase: 'idle',
    percent: 0,
    title: 'Field Sense leadership summary',
    employee: null,
  });
  useEffect(() => {
    if (state.phase !== 'running') return;
    const timer = window.setInterval(
      () =>
        setState((previous) => {
          const percent = Math.min(100, previous.percent + 7);
          return { ...previous, percent, phase: percent === 100 ? 'ready' : 'running' };
        }),
      170,
    );
    return () => window.clearInterval(timer);
  }, [state.phase]);
  return {
    ...state,
    run: (employee: string | null = null) =>
      setState((previous) =>
        previous.phase === 'running'
          ? previous
          : {
              phase: 'running',
              percent: 0,
              title: employee ? `Coaching report · ${employee}` : 'Field Sense leadership summary',
              employee,
            },
      ),
  };
}
export type DemoReport = ReturnType<typeof useDemoReport>;
