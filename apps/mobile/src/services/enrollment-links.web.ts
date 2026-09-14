export function getInitialEnrollmentLink(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return Promise.resolve(scrubEnrollmentLocation(window.location, window.history));
}

export function subscribeToEnrollmentLinks(listener: (url: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleHashChange = () => {
    const value = scrubEnrollmentLocation(window.location, window.history);
    if (value) listener(value);
  };
  window.addEventListener('hashchange', handleHashChange);
  return () => window.removeEventListener('hashchange', handleHashChange);
}

type LocationLike = Pick<Location, 'href' | 'hash' | 'pathname' | 'search'>;
type HistoryLike = Pick<History, 'state' | 'replaceState'>;

export function scrubEnrollmentLocation(
  location: LocationLike,
  history: HistoryLike,
): string | null {
  if (!location.hash) return null;
  const value = location.href;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  return value;
}
