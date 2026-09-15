import { useEffect, useState } from 'react';

/** One in-memory clock shared by the demo. No network or persistent state. */
export function useDemoSimulation() {
  const [running, setRunning] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => {
      if (preference.matches) setRunning(false);
    };
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) setSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  return { running, seconds, toggle: () => setRunning((value) => !value) };
}
