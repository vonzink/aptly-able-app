import { createHash } from 'node:crypto';

export function sdkHashMatches(bytes, expected) {
  return (
    /^[a-f0-9]{64}$/i.test(expected ?? '') &&
    createHash('sha256').update(bytes).digest('hex') === expected.toLowerCase()
  );
}
