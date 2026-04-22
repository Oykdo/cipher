import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cipher';
const SCHEMA_PATH = join(process.cwd(), 'scripts', 'schema_postgresql.sql');

async function runSchema() {
    console.log('🐘 Connecting to PostgreSQL...');
    const pool = new pg.Pool({ connectionString: POSTGRES_URL });

    try {
        console.log(`📂 Reading schema from ${SCHEMA_PATH}...`);
        const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');

        console.log('🚀 Executing schema migration...');
        await pool.query(schemaSql);

        console.log('✅ Schema applied successfully!');
    } catch (error) {
        console.error('❌ Schema migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runSchema();
