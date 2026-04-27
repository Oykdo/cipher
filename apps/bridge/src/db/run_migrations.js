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

// Note: privacy-l1 (2026-04-27) drops several columns these legacy
// migrations originally added (sender_plaintext, mnemonic, master_key_hex,
// dicekey_checksums, IPs in audit_logs) AND the audit_logs table itself.
// The legacy migrations are kept on disk for historical traceability but
// are no longer applied by default. A fresh deployment runs
// scripts/schema_postgresql.sql (L1-clean) directly.
//
// Excluded from the active list:
//   - 003_update_audit_logs_jsonb.sql : audit_logs table dropped in 004
//   - 004_add_sender_plaintext.sql    : column dropped in 002
const migrations = [
    '001_add_dicekey_tables.sql',
    '002_add_discoverable.sql',
    '002_add_user_dicekey_fields.sql',
    'add_conversation_requests.sql',
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
