import { describe, expect, it } from 'vitest';
import { createAssignmentRequestSchema } from '../src/index.js';

const userId = '8cd7c040-9c09-4629-b1a1-9e8dfecf4e10';

describe('recorder registration compatibility', () => {
  it.each([
    ['notepro', '8810004812'],
    ['notepins', '8820005641'],
    ['notepins', '882B123456785641'],
    ['notepro', '881b-12344812'],
  ])('accepts the full %s serial %s without changing its case or letters', (model, serial) => {
    expect(createAssignmentRequestSchema.parse({ userId, model, serial: ` ${serial} ` })).toEqual({
      userId,
      model,
      serial,
    });
  });

  it.each([
    ['notepro', '882B123456785641'],
    ['notepins', '8810004812'],
    ['notepins', '8800005641'],
    ['notepro', '9990004812'],
  ])('rejects %s with incompatible serial %s at the serial field', (model, serial) => {
    const result = createAssignmentRequestSchema.safeParse({ userId, model, serial });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('An incompatible recorder was accepted');
    expect(result.error.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['serial'] })]),
    );
    expect(result.error.message).not.toContain(serial);
  });

  it.each(['', '5641', '882 0005641', '882000ABCD', '882/0005641', `882${'A'.repeat(58)}5641`])(
    'rejects incomplete or malformed serials: %s',
    (serial) => {
      expect(
        createAssignmentRequestSchema.safeParse({ userId, model: 'notepins', serial }).success,
      ).toBe(false);
    },
  );

  it('keeps unsupported models and extra fields out of new assignments', () => {
    const input = { userId, model: 'notepins', serial: '8820005641' };
    expect(createAssignmentRequestSchema.safeParse({ ...input, model: 'notepin' }).success).toBe(
      false,
    );
    expect(createAssignmentRequestSchema.safeParse({ ...input, status: 'active' }).success).toBe(
      false,
    );
  });
});
