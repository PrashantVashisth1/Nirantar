import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      // Local Docker database from docker-compose.yml; CI sets its own DATABASE_URL.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://nirantar:nirantar_local_only@localhost:5433/nirantar',
    },
    // Integration tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
});
