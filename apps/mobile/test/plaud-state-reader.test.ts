import { expect, it } from 'vitest';
import { createPlaudStateReader } from '../src/features/plaud-device/plaud-state-reader';

function fixture() {
  let answer: ((state: unknown) => void) | undefined;
  let disconnected: (() => void) | undefined;
  let requests = 0;
  const read = createPlaudStateReader({
    request: async () => {
      requests++;
    },
    subscribe: (receive, lost) => {
      answer = receive;
      disconnected = lost;
      return () => {
        answer = undefined;
        disconnected = undefined;
      };
    },
  });
  return {
    read,
    answer: (state: unknown) => answer?.(state),
    disconnect: () => disconnected?.(),
    requests: () => requests,
  };
}

it('accepts only explicit current state and releases its subscription after a response', async () => {
  const test = fixture();
  const pending = test.read(new AbortController().signal);
  test.answer('idle');
  expect(await pending).toBe('idle');
  const second = test.read(new AbortController().signal);
  test.answer(undefined);
  expect(await second).toBe('unknown');
  expect(test.requests()).toBe(2);
});

it('does not assign a late response from a cancelled query to a newer query', async () => {
  const test = fixture();
  const abort = new AbortController();
  const first = test.read(abort.signal);
  const rejected = expect(first).rejects.toThrow();
  abort.abort();
  await rejected;
  await expect(test.read(new AbortController().signal)).rejects.toThrow();
  expect(test.requests()).toBe(1);
  test.answer('idle');
  const next = test.read(new AbortController().signal);
  test.answer('recording');
  expect(await next).toBe('recording');
});

it('releases a pending query when Bluetooth disconnects so a new connection can read state', async () => {
  const test = fixture();
  const first = test.read(new AbortController().signal);
  const rejected = expect(first).rejects.toThrow();
  test.disconnect();
  await rejected;
  const next = test.read(new AbortController().signal);
  test.answer('idle');
  expect(await next).toBe('idle');
});

it('does not let a completed request failure release ownership of the next pending read', async () => {
  const firstDispatch = Promise.withResolvers<void>();
  let response: ((state: unknown) => void) | undefined;
  let requests = 0;
  const read = createPlaudStateReader({
    request: () => (++requests === 1 ? firstDispatch.promise : Promise.resolve()),
    subscribe: (answer) => {
      response = answer;
      return () => {};
    },
  });
  const first = read(new AbortController().signal);
  response?.('idle');
  expect(await first).toBe('idle');
  const second = read(new AbortController().signal);
  firstDispatch.reject(new Error('late dispatch failure'));
  await Promise.resolve();
  await expect(read(new AbortController().signal)).rejects.toThrow();
  expect(requests).toBe(2);
  response?.('recording');
  expect(await second).toBe('recording');
});
