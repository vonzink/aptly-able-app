import { describe, expect, it } from 'vitest';

import { scrubEnrollmentLocation } from '../src/services/enrollment-links.web';

describe('web enrollment link scrubbing', () => {
  it('removes the fragment while preserving router history state', () => {
    const replacements: unknown[][] = [];
    const state = { expoRouter: 'state' };
    const href = scrubEnrollmentLocation(
      {
        href: 'http://localhost:8088/enroll#token=secret',
        hash: '#token=secret',
        pathname: '/enroll',
        search: '',
      },
      { state, replaceState: (...args) => replacements.push(args) },
    );

    expect(href).toBe('http://localhost:8088/enroll#token=secret');
    expect(replacements).toEqual([[state, '', '/enroll']]);
  });
});
