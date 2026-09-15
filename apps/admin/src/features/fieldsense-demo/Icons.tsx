const paths = {
  report:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 17v-4 M12 17v-6 M16 17v-2',
  phone:
    'M22 16.9v3a2 2 0 0 1-2.2 2 20 20 0 0 1-17.7-17.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4l2.8.7a2 2 0 0 1 1.7 2z',
  calendar: 'M3 5h18v16H3z M16 2v6 M8 2v6 M3 11h18 M7 15h3 M14 15h3',
  dollar: 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  store: 'M3 9l2-5h14l2 5 M4 9v12h16V9 M9 21v-7h6v7 M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',
  contact:
    'M3 5h18v15H3z M8 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M5 17v-1a3 3 0 0 1 6 0v1 M14 9h4 M14 13h4 M14 17h3',
  plane: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  sparkle: 'M12 3l2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z M20 2v4 M18 4h4',
  alert: 'M12 3L2 21h20z M12 9v5 M12 17v1',
  play: 'M8 4l12 8-12 8z',
  pause: 'M8 5v14 M16 5v14',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  building: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M10 21v-4h4v4',
  upload: 'M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',
  close: 'M6 6l12 12 M6 18L18 6',
  back: 'M19 12H5 M12 5l-7 7 7 7',
  chart: 'M4 20V12h4v8z M10 20V7h4v13z M16 20V2h4v18z',
  check: 'M5 12l4 4L19 6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  headphones: 'M3 14v-3a9 9 0 0 1 18 0v3 M3 12h4v8H3z M17 12h4v8h-4z',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <svg width="28" height="26" viewBox="0 0 26 26" aria-hidden="true">
          {[12, 22, 8, 26, 16, 6].map((height, index) => (
            <rect
              key={index}
              x={index * 4.4}
              y={(26 - height) / 2}
              width="2.6"
              height={height}
              rx="1.3"
              fill="currentColor"
            />
          ))}
        </svg>
        <strong>CallSense</strong>
      </div>
      <small>by Vantedges</small>
    </div>
  );
}
