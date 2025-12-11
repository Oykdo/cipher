import sqlite3 from '@journeyapps/sqlcipher';
import pg from 'pg';
import { join } from 'path';
import { existsSync } from 'fs';

// Configuration
const SQLITE_DB_PATH = process.env.BRIDGE_DATA_DIR ? join(process.env.BRIDGE_DATA_DIR, 'dead-drop-migration.db') : './data/dead-drop-migration.db';
// const SQLITE_KEY = process.env.BRIDGE_DB_KEY; // Not used for plaintext
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cipherpulse';

if (!existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ Source database not found at ${SQLITE_DB_PATH}`);
    process.exit(1);
}

async function migrate() {
    console.log('🚀 Starting migration from SQLite to PostgreSQL...');

    // 1. Connect to SQLite
    console.log('📂 Opening SQLite database...');
    const sqlite = new sqlite3.Database(SQLITE_DB_PATH);
    console.log('✅ SQLite connected (Plaintext).');

    // 2. Connect to PostgreSQL
    console.log('🐘 Connecting to PostgreSQL...');
    const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });
    await pgPool.query('SELECT NOW()'); // Test connection
    console.log('✅ PostgreSQL connected.');

    // Helper to get all rows from SQLite
    const getAll = (sql: string, params: any[] = []): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            sqlite.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    };

    try {
        await pgPool.query('BEGIN');

        // --- USERS ---
        console.log('Migrating Users...');
        const users = await getAll('SELECT * FROM users');
        for (const u of users) {
            await pgPool.query(
                `INSERT INTO users (id, username, security_tier, mnemonic, master_key_hex, discoverable, srp_salt, srp_verifier, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
                [u.id, u.username, u.security_tier, u.mnemonic, u.master_key_hex, !!u.discoverable, u.srp_salt, u.srp_verifier, u.created_at]
            );
        }
        console.log(`✅ Migrated ${users.length} users.`);

        // --- CONVERSATIONS ---
        console.log('Migrating Conversations...');
        const conversations = await getAll('SELECT * FROM conversations');
        const conversationIds = new Set(conversations.map(c => c.id));

        for (const c of conversations) {
            await pgPool.query(
                `INSERT INTO conversations (id, created_at, last_message_id, last_message_at)
         VALUES ($1, to_timestamp($2 / 1000.0), $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
                [c.id, c.created_at, c.last_message_id, c.last_message_at]
            );
        }
        console.log(`✅ Migrated ${conversations.length} conversations.`);

        // --- CONVERSATION MEMBERS ---
        console.log('Migrating Conversation Members...');
        const members = await getAll('SELECT * FROM conversation_members');
        let skippedMembers = 0;
        for (const m of members) {
            if (!conversationIds.has(m.conversation_id)) {
                skippedMembers++;
                continue;
            }
            await pgPool.query(
                `INSERT INTO conversation_members (conversation_id, user_id, joined_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
                [m.conversation_id, m.user_id, m.joined_at]
            );
        }
        console.log(`✅ Migrated ${members.length - skippedMembers} members (${skippedMembers} orphans skipped).`);

        // --- MESSAGES ---
        console.log('Migrating Messages...');
        const messages = await getAll('SELECT * FROM messages');
        let skippedMessages = 0;
        for (const m of messages) {
            if (!conversationIds.has(m.conversation_id)) {
                skippedMessages++;
                continue;
            }
            await pgPool.query(
                `INSERT INTO messages (id, conversation_id, sender_id, body, created_at, unlock_block_height, is_burned, burned_at, scheduled_burn_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, to_timestamp($8 / 1000.0), to_timestamp($9 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
                [
                    m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                    m.unlock_block_height, !!m.is_burned, m.burned_at, m.scheduled_burn_at
                ]
            );
        }
        console.log(`✅ Migrated ${messages.length - skippedMessages} messages (${skippedMessages} orphans skipped).`);

        // --- ATTACHMENTS ---
        console.log('Migrating Attachments...');
        const attachments = await getAll('SELECT * FROM attachments');
        let skippedAttachments = 0;
        for (const a of attachments) {
            if (!conversationIds.has(a.conversation_id)) {
                skippedAttachments++;
                continue;
            }
            await pgPool.query(
                `INSERT INTO attachments (id, conversation_id, uploader_id, filename, mime, size, path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
                [a.id, a.conversation_id, a.uploader_id, a.filename, a.mime, a.size, a.path, a.created_at]
            );
        }
        console.log(`✅ Migrated ${attachments.length - skippedAttachments} attachments (${skippedAttachments} orphans skipped).`);

        // --- REFRESH TOKENS ---
        console.log('Migrating Refresh Tokens...');
        const tokens = await getAll('SELECT * FROM refresh_tokens');
        for (const t of tokens) {
            await pgPool.query(
                `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked, revoked_at, last_used_at, user_agent, ip_address)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0), $9, $10)
         ON CONFLICT (id) DO NOTHING`,
                [
                    t.id, t.user_id, t.token_hash, t.expires_at, t.created_at,
                    !!t.revoked, t.revoked_at, t.last_used_at, t.user_agent, t.ip_address
                ]
            );
        }
        console.log(`✅ Migrated ${tokens.length} refresh tokens.`);

        // --- DICEKEY TABLES ---
        // Identity Keys
        const identityKeys = await getAll('SELECT * FROM identity_keys');
        for (const k of identityKeys) {
            await pgPool.query(
                `INSERT INTO identity_keys (user_id, public_key, fingerprint, created_at, is_active, revoked_at)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, to_timestamp($6 / 1000.0))
         ON CONFLICT (user_id, public_key) DO NOTHING`,
                [k.user_id, k.public_key, k.fingerprint, k.created_at, !!k.is_active, k.revoked_at]
            );
        }
        console.log(`✅ Migrated ${identityKeys.length} identity keys.`);

        // Signature Keys
        const signatureKeys = await getAll('SELECT * FROM signature_keys');
        for (const k of signatureKeys) {
            await pgPool.query(
                `INSERT INTO signature_keys (user_id, public_key, fingerprint, created_at, is_active, revoked_at)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, to_timestamp($6 / 1000.0))
         ON CONFLICT (user_id, public_key) DO NOTHING`,
                [k.user_id, k.public_key, k.fingerprint, k.created_at, !!k.is_active, k.revoked_at]
            );
        }
        console.log(`✅ Migrated ${signatureKeys.length} signature keys.`);

        // Signed Pre Keys
        const signedPreKeys = await getAll('SELECT * FROM signed_pre_keys');
        for (const k of signedPreKeys) {
            await pgPool.query(
                `INSERT INTO signed_pre_keys (user_id, key_id, public_key, signature, timestamp, created_at, is_active, revoked_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (user_id, key_id) DO NOTHING`,
                [k.user_id, k.key_id, k.public_key, k.signature, k.timestamp, k.created_at, !!k.is_active, k.revoked_at]
            );
        }
        console.log(`✅ Migrated ${signedPreKeys.length} signed pre keys.`);

        // One Time Pre Keys
        const otks = await getAll('SELECT * FROM one_time_pre_keys');
        // Batch insert for OTKs as there might be many
        for (const k of otks) {
            await pgPool.query(
                `INSERT INTO one_time_pre_keys (user_id, key_id, public_key, created_at, used_at, used_by)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), $6)
         ON CONFLICT (user_id, key_id) DO NOTHING`,
                [k.user_id, k.key_id, k.public_key, k.created_at, k.used_at, k.used_by]
            );
        }
        console.log(`✅ Migrated ${otks.length} one-time pre keys.`);

        await pgPool.query('COMMIT');
        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        await pgPool.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        sqlite.close();
        await pgPool.end();
    }
}

migrate().catch(console.error);
