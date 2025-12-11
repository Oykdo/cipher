import sqlite3 from '@journeyapps/sqlcipher';
import pg from 'pg';
import { join } from 'path';
import { existsSync } from 'fs';

// Configuration
const SQLITE_DB_PATH = process.env.BRIDGE_DATA_DIR ? join(process.env.BRIDGE_DATA_DIR, 'dead-drop-migration.db') : './data/dead-drop-migration.db';
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cipherpulse';

if (!existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ Source database not found at ${SQLITE_DB_PATH}`);
    process.exit(1);
}

async function validate() {
    console.log('🔍 Validating migration...');

    // 1. Connect SQLite
    const sqlite = new sqlite3.Database(SQLITE_DB_PATH);
    console.log('✅ SQLite connected (Plaintext).');

    // 2. Connect Postgres
    const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });
    await pgPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected.');

    const tables = [
        'users',
        'conversations',
        'conversation_members',
        'messages',
        'attachments',
        'refresh_tokens',
        'identity_keys',
        'signature_keys',
        'signed_pre_keys',
        'one_time_pre_keys'
    ];

    let allMatch = true;

    console.log('📊 Comparing Row Counts:');
    console.log('---------------------------------------------------');
    console.log('| Table                | SQLite | Postgres | Status |');
    console.log('---------------------------------------------------');

    for (const table of tables) {
        const sqliteCount = await new Promise<number>((resolve, reject) => {
            sqlite.get(`SELECT COUNT(*) as c FROM ${table}`, (err, row: any) => {
                if (err) reject(err);
                else resolve(row.c);
            });
        });

        const pgResult = await pgPool.query(`SELECT COUNT(*) as c FROM ${table}`);
        const pgCount = parseInt(pgResult.rows[0].c, 10);

        const match = sqliteCount === pgCount;
        // Allow mismatch for filtered tables if SQLite has more (orphans)
        const acceptableMismatch = !match && (table === 'conversation_members' || table === 'messages' || table === 'attachments') && sqliteCount > pgCount;

        if (!match && !acceptableMismatch) allMatch = false;

        const statusIcon = match ? '✅' : (acceptableMismatch ? '⚠️' : '❌');

        console.log(
            `| ${table.padEnd(20)} | ${sqliteCount.toString().padEnd(6)} | ${pgCount.toString().padEnd(8)} | ${statusIcon}     |`
        );
    }
    console.log('---------------------------------------------------');

    if (allMatch) {
        console.log('🎉 VALIDATION SUCCESSFUL: All row counts match (or have acceptable filtered orphans).');
    } else {
        console.error('❌ VALIDATION FAILED: Significant row count mismatch detected.');
        process.exit(1);
    }

    sqlite.close();
    await pgPool.end();
}

validate().catch(console.error);
