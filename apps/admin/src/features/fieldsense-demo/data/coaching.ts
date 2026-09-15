// Sample content from the supplied Field Sense design handoff. Never live data.
import type { Coaching } from '../types';

export const coaching: Record<number, readonly Coaching[]> = {
  0: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Diagnosed the failed capacitor clearly and presented a straightforward repair the customer accepted on the spot.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Move faster from explanation to commitment — ask for the replacement-quote appointment before leaving the driveway.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Ownership on the Ridgeline bid was never confirmed. Name who calls back and by when.',
    },
  ],
  1: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Strong consultative framing on the install — tied equipment tier to operating cost in plain language.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Two additional rooftop units were mentioned and never logged. Capture adjacent scope before the visit ends.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Warranty labor question left unanswered — escalate to the office the same day.',
    },
  ],
  2: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Explained the UV product line in practical terms and positioned it as a revenue opportunity for the customer.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Pair operational advice with a scheduled ask — recommend duct-cleaning timing and book it in the same breath.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Hard-dated bid commitment missed. The Arbor Dental board deadline was heard and not actioned.',
    },
  ],
  3: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Closed a showroom walk-in same-day by tying install date to the signature.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Send the promised monthly-payment text before the customer has to ask twice.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Two financing callbacks this week had no logged outcome.',
    },
  ],
  4: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Clean PM route with a two-year renewal secured on site.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Filter and IAQ upgrades get mentioned but rarely priced — attach rate is the easy win here.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'No documented next action on two of four stops.',
    },
  ],
  5: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Thorough compressor diagnosis with clear before/after explanation.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Rental-property agreement was quoted but never chased. One call closes it.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Firmware 2.8.0 and LTE syncing are degrading capture quality — update at the shop.',
    },
  ],
  6: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Good technical questions on the ride-along; customer rapport is developing.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Practice handling one pricing question per visit instead of deferring every time.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'No independent capture yet — pair recording with the lead tech next week.',
    },
  ],
  7: [
    {
      label: 'Went well',
      tone: 'ok',
      body: 'Deep technical credibility on the Brookhaven estimate walk.',
    },
    {
      label: 'Coach',
      tone: 'warn',
      body: 'Every estimate promise needs a name and a date attached before the call ends.',
    },
    {
      label: 'Follow-through',
      tone: 'bad',
      body: 'Device offline 3h 12m with 7 unsynced clips — three site visits have no evidence at all.',
    },
  ],
};
