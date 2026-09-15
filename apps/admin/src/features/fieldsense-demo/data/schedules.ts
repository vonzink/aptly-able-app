// Sample content from the supplied Field Sense design handoff. Never live data.
import type { Job } from '../types';

export const jobs: Record<number, readonly Job[]> = {
  0: [
    { s: 7.5, e: 9, label: 'Maintenance — Halsey Residence', meta: 'captured 1:24:08', t: 'cap' },
    {
      s: 9.5,
      e: 11.5,
      label: 'No-cool diagnostic — Trenton Bldg',
      meta: 'captured 2:02:51',
      t: 'cap',
    },
    {
      s: 12.5,
      e: 14,
      label: 'Quote follow-up — Ridgeline HOA',
      meta: 'no capture · device idle',
      t: 'gap',
    },
    {
      s: 14.5,
      e: 17,
      label: 'System replacement consult',
      meta: 'scheduled · 405-555-0148',
      t: 'sch',
    },
  ],
  1: [
    { s: 7, e: 10.5, label: 'Furnace install — Kessler St', meta: 'captured 3:04:12', t: 'cap' },
    { s: 11, e: 12.5, label: 'Warranty walkthrough', meta: 'captured 1:10:40', t: 'cap' },
    { s: 13.5, e: 16.5, label: 'Rooftop unit swap — Bell Plaza', meta: 'scheduled', t: 'sch' },
  ],
  2: [
    { s: 8, e: 9.5, label: 'UV / IAQ consult — Devon Tower', meta: 'captured 1:31:22', t: 'cap' },
    { s: 10, e: 12, label: 'Equipment bid — Arbor Dental', meta: 'captured 2:04:09', t: 'cap' },
    { s: 13, e: 14.5, label: 'Duct cleaning estimate', meta: 'no capture · storage 91%', t: 'gap' },
    { s: 15, e: 17.5, label: 'Financing presentation', meta: 'scheduled', t: 'sch' },
  ],
  3: [
    { s: 9, e: 10.5, label: 'Showroom walk-in — 4-ton', meta: 'captured 1:02:11', t: 'cap' },
    { s: 11, e: 12, label: 'Financing callback', meta: 'captured 41:08', t: 'cap' },
    { s: 14, e: 16, label: 'Trade-in appraisal', meta: 'scheduled', t: 'sch' },
  ],
  4: [
    { s: 7.5, e: 11, label: 'PM route A — 4 stops', meta: 'captured 3:11:40', t: 'cap' },
    { s: 13, e: 15, label: 'Agreement renewal call', meta: 'scheduled', t: 'sch' },
  ],
  5: [
    { s: 8, e: 10, label: 'Compressor repair — Yale Ave', meta: 'captured 1:58:22', t: 'cap' },
    { s: 11, e: 13, label: 'Rental property audit', meta: 'no capture · syncing', t: 'gap' },
    { s: 14, e: 16, label: 'Maintenance agreement pitch', meta: 'scheduled', t: 'sch' },
  ],
  6: [
    { s: 8, e: 12, label: 'Ride-along — Truck 03', meta: 'captured 55:12', t: 'cap' },
    { s: 13.5, e: 15, label: 'Shop inventory', meta: 'scheduled', t: 'sch' },
  ],
  7: [
    { s: 7.5, e: 8.5, label: 'Estimate — Brookhaven', meta: 'captured 22:04', t: 'cap' },
    { s: 9, e: 12, label: 'Bid walk — 3 sites', meta: 'no capture · device offline', t: 'gap' },
    { s: 13, e: 16, label: 'Reassigned to Truck 12', meta: 'scheduled', t: 'sch' },
  ],
};
