/** CI gets a fresh database through DATABASE_URL; locally E2E shares the test database, never the demo one. */
export const DATABASE_URL = process.env.CI
  ? process.env.DATABASE_URL!
  : 'postgresql://nirantar:nirantar_local_only@localhost:15433/nirantar_test';
export const API_PORT = 4100;
export const WEB_PORT = 5174;
