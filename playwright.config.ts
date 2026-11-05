import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end journeys against the real frontend, backend and database.
 * The AI is switched off so results never depend on an outside service; that
 * also exercises the manual path, which has to work on its own (plan §8).
 *
 * The local demo data is reset first (see e2e/global-setup.ts).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  outputDir: './e2e/.results',
  webServer: [
    {
      // Not `npm run dev`: tsx's watch mode doesn't start without a terminal.
      command: 'npx tsx --env-file=.env src/server.ts',
      cwd: 'backend',
      url: 'http://localhost:4000/api/health',
      env: { GEMINI_API_KEY: 'off' },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
  ],
});
