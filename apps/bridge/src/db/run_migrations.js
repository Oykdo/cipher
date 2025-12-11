/**
 * Migration Runner Script
 * Applies SQL migrations to PostgreSQL database
 */

import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const migrations = [
    '001_add_dicekey_tables.sql',
    '002_add_discoverable.sql',
    '002_add_user_dicekey_fields.sql',
    'add_conversation_requests.sql',
    '003_update_audit_logs_jsonb.sql'
];

async function runMigrations() {
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
        console.log('🔗 Connecting to PostgreSQL...');
        await pool.query('SELECT NOW()');
        console.log('✅ Connected successfully\n');

        for (const migrationFile of migrations) {
            const migrationPath = join(__dirname, 'migrations', migrationFile);

            try {
                console.log(`📄 Running migration: ${migrationFile}`);
                const sql = readFileSync(migrationPath, 'utf8');

                await pool.query(sql);

                console.log(`✅ ${migrationFile} applied successfully\n`);
            } catch (error) {
                console.error(`❌ Failed to apply ${migrationFile}:`);
                console.error(error.message);

                // Check if error is about already existing objects
                if (error.message.includes('already exists')) {
                    console.log(`⚠️  Some objects already exist, continuing...\n`);
                } else {
                    console.error('\n🛑 Migration failed. Stopping.');
                    process.exit(1);
                }
            }
        }

        console.log('🎉 All migrations completed successfully!');

    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
