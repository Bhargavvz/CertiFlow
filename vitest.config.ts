import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global.ts'],
    setupFiles: ['tests/setup/env.ts', 'tests/setup/hooks.ts'],
    // Integration tests share one Postgres/Redis, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
