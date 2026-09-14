import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for integration tests.');
}

export default defineConfig({
  resolve: {
    alias: {
      '@aptly/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['apps/api/test/**/*.integration.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
