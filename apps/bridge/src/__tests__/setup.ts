import { beforeAll, afterAll, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../db/database.js';

// Setup test database
beforeAll(() => {
  // Use in-memory database for tests
  process.env.BRIDGE_DATA_DIR = ':memory:';
});

// Clean database after each test
afterEach(() => {
  const db = getDatabase();
  db.clearAll();
});

// Close database after all tests
afterAll(() => {
  closeDatabase();
});
