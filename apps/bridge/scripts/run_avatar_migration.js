import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

async function runMigration() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ DATABASE_URL environment variable is missing!');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString,
        ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });

    try {
        console.log('🔄 Running avatar_hash migration...');

        const migrationSQL = readFileSync(join(__dirname, 'add_avatar_hash_column.sql'), 'utf-8');

        await pool.query(migrationSQL);

        console.log('✅ Migration completed successfully!');
        console.log('   - Added avatar_hash column to users table');
        console.log('   - Created index on avatar_hash');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
