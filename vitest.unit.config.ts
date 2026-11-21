import { defineConfig } from 'vitest/config';

// Pure unit tests: no Postgres, Redis or MinIO needed. `npm run test:unit`
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
