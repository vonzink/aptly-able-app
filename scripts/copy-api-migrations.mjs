import { cp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const source = new URL('../apps/api/src/infrastructure/migrations/', import.meta.url);
const destination = new URL('../apps/api/dist/infrastructure/migrations/', import.meta.url);
await readdir(source);
await rm(destination, { recursive: true, force: true });
await cp(fileURLToPath(source), fileURLToPath(destination), { recursive: true });
