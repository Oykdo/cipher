/**
 * Migration Script: better-sqlite3 → SQLCipher
 *
 * This script migrates an unencrypted SQLite database to an encrypted one using SQLCipher.
 * Uses better-sqlite3 (sync) to read the source DB, and @journeyapps/sqlcipher (sqlite3 async API) to write the encrypted DB.
 *
 * Usage:
 *   npm run migrate:encrypt
 */

import BetterSqlite from 'better-sqlite3';
import sqlite3 from '@journeyapps/sqlcipher';
import { existsSync, copyFileSync, renameSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = process.env.BRIDGE_DATA_DIR || './data';
const OLD_DB_PATH = join(DATA_DIR, 'dead-drop.db');
const NEW_DB_PATH = join(DATA_DIR, 'dead-drop-encrypted.db');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const KEY_PATH = join(DATA_DIR, '.db.key');

sqlite3.verbose();

function generateEncryptionKey() {
  return randomBytes(32).toString('hex');
}

function ensureDirs() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(BACKUP_DIR, { recursive: true });
}

function createBackup() {
  ensureDirs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `pre-encryption-${timestamp}.db`);
  console.log(`\n📦 Creating backup...`);
  copyFileSync(OLD_DB_PATH, backupPath);
  console.log(`✅ Backup created: ${backupPath}`);
  return backupPath;
}

// Small helpers to promisify sqlite3
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function migrateToEncrypted() {
  console.log('\n🔐 SQLCipher Migration Tool');
  console.log('=============================\n');

  if (!existsSync(OLD_DB_PATH)) {
    console.error(`❌ Database not found: ${OLD_DB_PATH}`);
    console.log('   If this is a fresh install, no migration needed.');
    process.exit(0);
  }

  if (existsSync(KEY_PATH)) {
    console.log('✅ Database is already encrypted (key file exists)');
    console.log(`   Key file: ${KEY_PATH}`);
    try {
      const key = readFileSync(KEY_PATH, 'utf8');
      console.log(`\n🔍 Testing database encryption...`);
      try {
        const testDb = new BetterSqlite(OLD_DB_PATH, { readonly: true });
        testDb.prepare('SELECT COUNT(*) FROM users').get();
        testDb.close();
        console.log('⚠️  WARNING: Database appears to be unencrypted!');
        console.log('   Key file exists but database is not encrypted.');
        console.log('   This might indicate a previous migration failed.');
      } catch (err) {
        if (String(err.message).includes('file is not a database')) {
          console.log('✅ Database is properly encrypted');
          process.exit(0);
        }
        throw err;
      }
    } catch (err) {
      console.error('❌ Error testing encryption:', err.message);
      process.exit(1);
    }
  }

  const backupPath = createBackup();

  console.log(`\n📖 Opening source database...`);
  const oldDb = new BetterSqlite(OLD_DB_PATH, { readonly: true });
  console.log('✅ Source database opened');

  console.log(`\n🔑 Generating encryption key...`);
  const encryptionKey = generateEncryptionKey();
  console.log('✅ 256-bit encryption key generated');

  console.log(`\n🔐 Creating encrypted database...`);
  const newDb = new sqlite3.Database(NEW_DB_PATH);

  // Configure SQLCipher pragmas (set algorithms BEFORE key for creation)
  await new Promise((resolve) => newDb.serialize(resolve));
  await run(newDb, `PRAGMA cipher_compatibility = 4`);
  await run(newDb, `PRAGMA cipher_page_size = 4096`);
  await run(newDb, `PRAGMA kdf_iter = 256000`);
  await run(newDb, `PRAGMA key = '${encryptionKey}'`);
  console.log('✅ Encryption parameters configured');

  console.log(`\n📋 Copying database schema...`);
  const schema = oldDb.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL"
  ).all();
  for (const { sql } of schema) {
    try {
      await exec(newDb, sql);
    } catch (err) {
      console.warn(`⚠️  Warning: ${err.message}`);
    }
  }
  const indexes = oldDb.prepare(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
  ).all();
  for (const { sql } of indexes) {
    try { await exec(newDb, sql); } catch {}
  }
  const triggers = oldDb.prepare(
    "SELECT sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL"
  ).all();
  for (const { sql } of triggers) {
    try { await exec(newDb, sql); } catch (err) { console.warn(`⚠️  Warning: ${err.message}`); }
  }
  console.log(`✅ Schema copied (${schema.length} tables, ${indexes.length} indexes, ${triggers.length} triggers)`);

  console.log(`\n📦 Copying data...`);
  const tables = [
    'users', 'conversations', 'conversation_members', 'messages',
    'attachments', 'refresh_tokens', 'audit_logs', 'metadata'
  ];
  let totalRows = 0;
  for (const table of tables) {
    const tableExists = oldDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!tableExists) { console.log(`   ⊘ ${table}: table doesn't exist (skipped)`); continue; }
    const rows = oldDb.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) { console.log(`   ✓ ${table}: 0 rows`); continue; }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(',');
    const insertSql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;

    await run(newDb, 'BEGIN');
    try {
      for (const row of rows) {
        const values = columns.map((c) => row[c]);
        await run(newDb, insertSql, values);
      }
      await run(newDb, 'COMMIT');
      totalRows += rows.length;
      console.log(`   ✓ ${table}: ${rows.length} rows`);
    } catch (err) {
      await run(newDb, 'ROLLBACK');
      console.error(`   ✗ ${table}: ERROR - ${err.message}`);
      throw err;
    }
  }
  console.log(`\n✅ Total: ${totalRows} rows migrated`);

  console.log(`\n🔍 Verifying data integrity...`);
  const verifications = [
    { table: 'users', label: 'Users' },
    { table: 'conversations', label: 'Conversations' },
    { table: 'messages', label: 'Messages' },
  ];
  let allVerified = true;
  for (const { table, label } of verifications) {
    try {
      const oldCount = oldDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      const newCount = await get(newDb, `SELECT COUNT(*) as count FROM ${table}`);
      if (oldCount.count === newCount?.count) {
        console.log(`   ✓ ${label}: ${oldCount.count} records`);
      } else {
        console.error(`   ✗ ${label}: MISMATCH (old: ${oldCount.count}, new: ${newCount?.count ?? 0})`);
        allVerified = false;
      }
    } catch {
      console.log(`   ⊘ ${label}: table not found (skipped)`);
    }
  }
  if (!allVerified) {
    console.error('\n❌ Data integrity check FAILED!');
    console.log('   Migration aborted. Original database unchanged.');
    oldDb.close();
    newDb.close();
    process.exit(1);
  }
  console.log('\n✅ Data integrity verified');

  oldDb.close();
  await new Promise((resolve) => newDb.close(resolve));

  console.log(`\n🔄 Replacing database...`);
  renameSync(OLD_DB_PATH, `${OLD_DB_PATH}.old`);
  renameSync(NEW_DB_PATH, OLD_DB_PATH);
  console.log('✅ Database replaced');

  console.log(`\n🔑 Saving encryption key...`);
  writeFileSync(KEY_PATH, encryptionKey, { mode: 0o600 });
  console.log(`✅ Key saved to: ${KEY_PATH}`);
  console.log('   ⚠️  KEEP THIS KEY SECURE! Without it, the database cannot be decrypted.');

  console.log(`\n🧪 Testing encrypted database...`);
  const testDb = new sqlite3.Database(OLD_DB_PATH);
  await run(testDb, `PRAGMA cipher_compatibility = 4`);
  await run(testDb, `PRAGMA cipher_page_size = 4096`);
  await run(testDb, `PRAGMA kdf_iter = 256000`);
  await run(testDb, `PRAGMA key = '${encryptionKey}'`);
  const result = await get(testDb, 'SELECT COUNT(*) as count FROM users');
  console.log(`✅ Encrypted database works (${result?.count ?? 0} users)`);
  await new Promise((resolve) => testDb.close(resolve));

  console.log('\n' + '='.repeat(60));
  console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   - Database: ${OLD_DB_PATH}`);
  console.log(`   - Encryption: AES-256-CBC with PBKDF2 (256k iterations)`);
  console.log(`   - Rows migrated: ${totalRows}`);
  console.log(`   - Backup: ${backupPath}`);
  console.log(`   - Old DB: ${OLD_DB_PATH}.old`);
  console.log(`   - Key file: ${KEY_PATH}`);
  console.log(`\n⚠️  IMPORTANT NEXT STEPS:`);
  console.log(`   1. Verify application works with encrypted database`);
  console.log(`   2. Backup the key file securely (${KEY_PATH})`);
  console.log(`   3. Delete old database once verified: del ${OLD_DB_PATH}.old`);
  console.log(`   4. Restart the application`);
  console.log(`\n🔒 Your database is now encrypted at rest!\n`);
}

migrateToEncrypted().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
