/**
 * Runner for migration 007_add_groups.sql (Cipher 1.2.0 group conversations).
 *
 * Idempotent: re-running this script is safe (every DDL uses IF NOT EXISTS
 * / ON CONFLICT). Reports the resulting schema_version + verifies the new
 * columns/table exist.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

dotenv.config({ path: join(dirname(__dirname), '.env') });

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/cipher';

async function runMigration() {
  console.log('🚀 Starting groups migration (007_add_groups.sql)...');
  console.log(`📦 Database: ${DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl:
      DATABASE_URL.includes('neon.tech') ||
      DATABASE_URL.includes('supabase') ||
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    const migrationPath = join(__dirname, 'migrations', '007_add_groups.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Executing migration: 007_add_groups.sql');
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully!');

    const conversationCols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'conversations'
        AND column_name IN ('type', 'created_by', 'encrypted_title')
      ORDER BY column_name;
    `);
    console.log('\n📊 Verification — new conversations columns:');
    conversationCols.rows.forEach((r) => {
      console.log(
        `  - ${r.column_name}: ${r.data_type} (nullable=${r.is_nullable}, default=${r.column_default ?? 'NULL'})`,
      );
    });

    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'message_deliveries' AND table_schema = 'public';
    `);
    console.log(
      `\n🗂️  message_deliveries table: ${tableCheck.rowCount > 0 ? '✅ exists' : '❌ MISSING'}`,
    );

    const versionRow = await pool.query(
      `SELECT value FROM metadata WHERE key = 'schema_version';`,
    );
    console.log(
      `\n📌 schema_version = ${versionRow.rows[0]?.value ?? '(unset)'}`,
    );

    console.log('\n🎉 Migration successful! Database ready for group conversations (1.2.0).');
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: PostgreSQL must be running and DATABASE_URL set.');
    } else if (error.code === '42P01') {
      console.error('\n💡 Tip: Required base table missing. Run schema_postgresql.sql first.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
