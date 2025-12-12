/**
 * Script to run database migration for e2ee-v2
 * Executes 001_add_public_keys.sql
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// Load environment variables from .env file
dotenv.config({ path: join(dirname(__dirname), '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cipher_pulse';

async function runMigration() {
  console.log('🚀 Starting e2ee-v2 migration...');
  console.log(`📦 Database: ${DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('supabase') || process.env.NODE_ENV === 'production' 
      ? { rejectUnauthorized: false } 
      : false,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Read migration file
    const migrationPath = join(__dirname, 'migrations', '001_add_public_keys.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Executing migration: 001_add_public_keys.sql');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // Verify changes
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('public_key', 'sign_public_key', 'updated_at')
      ORDER BY column_name;
    `);

    console.log('\n📊 Verification - New columns added:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'users'
      AND (indexname LIKE '%public_key%' OR indexname LIKE '%updated_at%')
      ORDER BY indexname;
    `);

    console.log('\n🔍 Indexes created:');
    indexResult.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    console.log('\n🎉 Migration successful! Database is ready for e2ee-v2.');

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Make sure PostgreSQL is running and DATABASE_URL is correct');
    } else if (error.code === '42P01') {
      console.error('\n💡 Tip: The "users" table does not exist. Run initial schema first.');
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
