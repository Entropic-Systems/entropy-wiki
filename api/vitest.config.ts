import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,  // 60s for Claude CLI tests
    hookTimeout: 30000,  // 30s for setup/teardown
    env: {
      NODE_ENV: 'test',
      ADMIN_PASSWORD: 'test-password',  // Required for auth middleware
    },
  },
});
