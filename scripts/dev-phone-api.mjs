import { createServer, createConnection, isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import process from 'node:process';
import { log, error } from 'node:console';

// An explicitly started, temporary LAN bridge. The API and its credentials remain on loopback.
// This does not provide TLS: use only for local development on a trusted private network.
const host = process.argv[2];
const [first, second] = (host ?? '').split('.').map(Number);
const privateAddress =
  isIPv4(host ?? '') &&
  (first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168));
const assignedAddress = Object.values(networkInterfaces())
  .flat()
  .some((entry) => entry && !entry.internal && entry.family === 'IPv4' && entry.address === host);

if (
  (process.env.NODE_ENV ?? 'development') !== 'development' ||
  !privateAddress ||
  !assignedAddress ||
  process.argv.length !== 3
) {
  error(
    "Use: pnpm dev:phone-api <this Mac's private IPv4 address>. Development only; public and wildcard listeners are rejected.",
  );
  process.exitCode = 1;
} else {
  const sockets = new Set();
  const server = createServer((client) => {
    const upstream = createConnection({ host: '127.0.0.1', port: 4100 });
    sockets.add(client);
    sockets.add(upstream);
    const close = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    for (const socket of [client, upstream]) {
      socket.setTimeout(120_000, close);
      socket.on('error', close);
      socket.on('close', close);
    }
    client.pipe(upstream).pipe(client);
  });
  server.maxConnections = 32;
  server.on('error', () => {
    error('Phone API bridge could not start. Check the private address and port 4100.');
    for (const socket of sockets) socket.destroy();
    server.close();
    process.exitCode = 1;
  });
  server.listen(4100, host, () => {
    log(`Phone API bridge: http://${host}:4100 → local API on 127.0.0.1:4100`);
    log(
      'Existing account/assignment checks apply. Keep the API running. Stop this bridge when phone testing ends.',
    );
  });
  const stop = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
