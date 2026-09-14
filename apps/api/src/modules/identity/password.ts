import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Fixed parameters prevent stored data from requesting unbounded work. At most two
// KDFs run in this process; callers receive a retryable error instead of queuing.
let active = 0;
export class PasswordBusyError extends Error {}
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active >= 2) throw new PasswordBusyError('Authentication is busy.');
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  } finally {
    active--;
  }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  stored: string | undefined,
): Promise<boolean> {
  const match = stored?.match(/^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const actual = await derive(password, match?.[1] ?? '0'.repeat(32));
  const expected = Buffer.from(match?.[2] ?? '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && !!match;
}
