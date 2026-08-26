import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
