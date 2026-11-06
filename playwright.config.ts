import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end journeys against the real frontend, backend and database.
 * The AI is switched off so results never depend on an outside service; that
 * also exercises the manual path, which has to work on its own (plan §8).
 *
 * Runs on its own ports and its own database (see e2e/config.ts), so it never
 * touches the demo data, and the dev servers can keep running alongside it.
 */
import { API_PORT, DATABASE_URL, WEB_PORT } from './e2e/config';

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
    baseURL: `http://localhost:${WEB_PORT}`,
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
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        GEMINI_API_KEY: 'off',
        DATABASE_URL,
        PORT: String(API_PORT),
        APP_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
    {
      command: `npm run dev -w frontend -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
  ],
});
