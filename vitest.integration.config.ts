import { defineConfig } from 'vitest/config';

// Requires a running Postgres + Redis and a populated .env (see .env.example).
// Run `npx prisma migrate deploy` against a disposable test database first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
