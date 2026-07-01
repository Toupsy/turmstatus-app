import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Reine Unit- und API-Integrationstests laufen unter Node.
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    // API-Integrationstests booten einen echten Fastify-Server + SQLite → seriell.
    fileParallelism: false,
    testTimeout: 20000
  }
});
