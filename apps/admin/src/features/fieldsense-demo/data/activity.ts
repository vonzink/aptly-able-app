// Sample content from the supplied Field Sense design handoff. Never live data.
import type { FeedEvent } from '../types';

export const seedEvents: readonly FeedEvent[] = [
  {
    who: 'Ana Okafor',
    what: 'started recording — Arbor Dental, four-office equipment bid',
    tag: 'REC',
  },
  {
    who: 'Priya Raman',
    what: 'clip synced · 18m 04s · showroom walk-in, financing question',
    tag: 'SYNC',
  },
  {
    who: 'Hal Brennan',
    what: 'device offline — 12% battery, 7 clips still unsynced',
    tag: 'ALERT',
  },
  {
    who: 'Tom Fielder',
    what: 'AI flagged system-replacement intent · $14,200 · Trenton Bldg',
    tag: 'FLAG',
  },
  { who: 'Marcus Ruiz', what: 'job closed — Kessler St install, 3h 04m captured', tag: 'DONE' },
  { who: 'Ana Okafor', what: 'storage 91% — offload recommended before next stop', tag: 'ALERT' },
  { who: 'Ben Castille', what: 'uploading 3 clips over LTE · 44.0 GB used of 64 GB', tag: 'SYNC' },
  { who: 'Dee Whitlock', what: 'arrived on site — PM route A, Halsey Residence', tag: 'DONE' },
];
export const streamEvents: readonly FeedEvent[] = [
  {
    who: 'Priya Raman',
    what: 'started recording — showroom walk-in, 4-ton replacement',
    tag: 'REC',
  },
  {
    who: 'Marcus Ruiz',
    what: 'AI flagged adjacent scope · 2 rooftop units mentioned · $22,400',
    tag: 'FLAG',
  },
  {
    who: 'Tom Fielder',
    what: 'clip synced · 41m 12s · no-cool diagnostic, capacitor failure',
    tag: 'SYNC',
  },
  {
    who: 'Ana Okafor',
    what: 'AI heard a hard deadline — "before the board meets Thursday"',
    tag: 'AI',
  },
  { who: 'Jo Lindqvist', what: 'device paired · Truck 18 · firmware 2.8.1 verified', tag: 'DONE' },
  { who: 'Ben Castille', what: 'sync complete — 3 clips, 1h 22m added to library', tag: 'SYNC' },
  { who: 'Dee Whitlock', what: 'started recording — maintenance agreement renewal', tag: 'REC' },
  {
    who: 'Hal Brennan',
    what: 'battery critical at 9% — capture will stop in ~14 min',
    tag: 'ALERT',
  },
  {
    who: 'Ana Okafor',
    what: 'AI flagged unpriced add-on · UV across three floors · $6,900',
    tag: 'FLAG',
  },
  {
    who: 'Priya Raman',
    what: 'next-step confirmed on call — install booked for Sep 17',
    tag: 'DONE',
  },
  {
    who: 'Marcus Ruiz',
    what: 'transcript ready · 14 speaker turns · sentiment positive',
    tag: 'AI',
  },
  { who: 'Tom Fielder', what: 'AI flagged aging quote · Ridgeline HOA · open 3 days', tag: 'FLAG' },
  { who: 'Jo Lindqvist', what: 'clip synced · 22m 38s · ride-along with Truck 03', tag: 'SYNC' },
  { who: 'Ben Castille', what: 'storage 69% — headroom 12.4h remaining', tag: 'ALERT' },
  { who: 'Dee Whitlock', what: 'job closed — PM route A complete, 4 of 4 captured', tag: 'DONE' },
  { who: 'Ana Okafor', what: 'started recording — Devon Tower, IAQ consult', tag: 'REC' },
];
