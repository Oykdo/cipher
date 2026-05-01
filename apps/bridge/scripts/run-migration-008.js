/**
 * Runner for migration 008_fix_legacy_group_type.sql.
 *
 * Promotes legacy `conversations` rows back to type='group' when they
 * carry a group-only signal (owner / encrypted title / >2 members) but
 * were left at the DEFAULT 'direct' tag by migration 007. Idempotent.
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
  console.log('🚀 Starting legacy-group-type migration (008_fix_legacy_group_type.sql)...');
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

    const before = await pool.query(`
      SELECT type, COUNT(*)::int AS n
        FROM conversations
       GROUP BY type
       ORDER BY type;
    `);
    console.log('\n📊 Type distribution BEFORE:');
    before.rows.forEach((r) => console.log(`  - ${r.type}: ${r.n}`));

    const migrationPath = join(__dirname, 'migrations', '008_fix_legacy_group_type.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('\n📄 Executing migration: 008_fix_legacy_group_type.sql');
    await pool.query(migrationSQL);
    console.log('✅ Migration completed successfully!');

    const after = await pool.query(`
      SELECT type, COUNT(*)::int AS n
        FROM conversations
       GROUP BY type
       ORDER BY type;
    `);
    console.log('\n📊 Type distribution AFTER:');
    after.rows.forEach((r) => console.log(`  - ${r.type}: ${r.n}`));

    const versionRow = await pool.query(
      `SELECT value FROM metadata WHERE key = 'schema_version';`,
    );
    console.log(`\n📌 schema_version = ${versionRow.rows[0]?.value ?? '(unset)'}`);

    console.log('\n🎉 Done.');
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: PostgreSQL must be running and DATABASE_URL set.');
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
