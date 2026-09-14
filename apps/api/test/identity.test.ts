import { describe, expect, it } from 'vitest';
import { createDevelopmentIdentity } from '../src/modules/identity/development-identity.js';

const user = { token: 'u'.repeat(48), userId: '8cd7c040-9c09-4629-b1a1-9e8dfecf4e10' };
const admin = { token: 'a'.repeat(48), userId: '4cbda9d7-547d-4675-a2bb-540e5c4555cf' };

describe('development role boundary', () => {
  it('derives each role from a separate server-configured credential', () => {
    const verifier = createDevelopmentIdentity(user, admin);
    expect(verifier.verify(`Bearer ${user.token}`)).toEqual({ userId: user.userId, role: 'user' });
    expect(verifier.verify(`Bearer ${admin.token}`)).toEqual({
      userId: admin.userId,
      role: 'admin',
    });
    expect(verifier.verify(`Bearer ${'x'.repeat(48)}`)).toBeUndefined();
  });
  it('allows an admin-only development environment without enabling a user identity', () => {
    const verifier = createDevelopmentIdentity(undefined, admin);
    expect(verifier.verify(`Bearer ${user.token}`)).toBeUndefined();
    expect(verifier.verify(`Bearer ${admin.token}`)?.role).toBe('admin');
  });
});
