import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    include: ['src/**/*.integration.test.ts'],
    setupFiles: [],
    reporters: ['default'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
