require('dotenv').config();

const path = require('path');
const { spawnSync } = require('child_process');

const dbBackupScript = path.join(__dirname, 'db-backup.cjs');
const dbRestoreScript = path.join(__dirname, 'db-restore.cjs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing');
  process.exit(1);
}

const confirmed =
  process.argv.includes('--confirm') ||
  process.env.CONFIRM_RUN_TESTS_ON_PRIMARY_DB === 'YES';

if (!confirmed) {
  console.error(
    '🛑 Refusing to run: this will run test cleanup (TRUNCATE/clearAll) against the configured DATABASE_URL.\n' +
      'If you REALLY want to proceed, re-run with: node scripts/run-tests-with-backup.cjs --confirm'
  );
  process.exit(1);
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env },
  });
}

function runNpmTest() {
  // Allow destructive ops explicitly for tests (DatabaseService.clearAll)
  const env = {
    ...process.env,
    ALLOW_DESTRUCTIVE_DB_OPS: '1',
    // Explicitly allow mapping primary -> DATABASE_URL_TEST when user chooses to run tests on the primary DB
    ALLOW_TESTS_ON_PRIMARY_DB: '1',
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
  };
  return spawnSync('npm', ['test'], {
    stdio: 'inherit',
    env,
    shell: true,
  });
}

const backupRes = spawnSync(process.execPath, [dbBackupScript], {
  stdio: 'pipe',
  env: { ...process.env },
});

if (backupRes.status !== 0) {
  process.stdout.write(backupRes.stdout || '');
  process.stderr.write(backupRes.stderr || '');
  console.error('❌ Backup failed, aborting');
  process.exit(2);
}

const stdout = (backupRes.stdout || '').toString('utf8');
process.stdout.write(stdout);
process.stderr.write((backupRes.stderr || '').toString('utf8'));

// Extract last printed backup path
const match = stdout.match(/Backup written to:\s*(.*)\s*$/m);
const backupPath = match?.[1]?.trim();

if (!backupPath) {
  console.error('❌ Could not determine backup path from backup script output');
  process.exit(2);
}

console.log(`\n▶ Running tests (DB will be modified): npm test`);
const testRes = runNpmTest();

console.log(`\n▶ Restoring backup: ${backupPath}`);
const restoreRes = runNode(dbRestoreScript, [backupPath]);

if (restoreRes.status !== 0) {
  console.error('🛑 Restore failed. Your DB may be in a bad state.');
  process.exit(3);
}

process.exit(testRes.status ?? 0);
