import { defineConfig } from 'vitest/config';

// Tests use their own database (nirantar_test), never the demo data in `nirantar`.
// CI provides DATABASE_URL for a fresh Postgres service.
const testDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://nirantar:nirantar_local_only@localhost:15433/nirantar_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
      OTP_PEPPER: 'test-otp-pepper-at-least-32-characters-long-x',
      PRESCRIPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      GEMINI_API_KEY: '',
    },
    // Integration tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
});
