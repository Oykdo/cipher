import { beforeAll, afterAll, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../db/database.js';

import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.ALLOW_DESTRUCTIVE_DB_OPS = '1';

// Safety: never run tests against the primary DB by default.
if (!process.env.DATABASE_URL_TEST) {
  if (process.env.ALLOW_TESTS_ON_PRIMARY_DB === '1' || process.env.ALLOW_TESTS_ON_PRIMARY_DB === 'true') {
    process.env.DATABASE_URL_TEST = process.env.DATABASE_URL;
  }
}

const canRunDbTests = Boolean(process.env.DATABASE_URL_TEST);

// Setup test database
beforeAll(() => {
  if (!canRunDbTests) {
    console.warn(
      '[Bridge tests] DATABASE_URL_TEST is missing; skipping DB-backed tests. ' +
        'Set DATABASE_URL_TEST to enable running the bridge test suite.'
    );
    return;
  }

  // Ensure database.js uses the test database
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
});

// Clean database after each test
afterEach(async () => {
  if (!canRunDbTests) return;
  const db = getDatabase();
  await db.clearAll();
});

// Close database after all tests
afterAll(() => {
  if (!canRunDbTests) return;
  closeDatabase();
});
