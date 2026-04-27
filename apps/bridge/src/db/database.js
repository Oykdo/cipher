import pg from 'pg';
import { readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// Promisified helpers adapted for pg
async function run(pool, sql, params = []) {
    return await pool.query(sql, params);
}

async function get(pool, sql, params = []) {
    const res = await pool.query(sql, params);
    return res.rows[0];
}

async function all(pool, sql, params = []) {
    const res = await pool.query(sql, params);
    return res.rows;
}

async function exec(pool, sql) {
    return await pool.query(sql);
}

// NOTE: encryptMnemonic / decryptMnemonic removed in privacy-l1 (2026-04-27).
// The mnemonic and master key never leave the user's device. The server has
// no business storing them, even encrypted — see CIPHER_PRIVACY_GUARANTEES.md.

class DatabaseService {
    constructor(dbPath) {
        // dbPath is ignored for Postgres, using env var
        const isTestEnv =
            process.env.NODE_ENV === 'test' ||
            process.env.VITEST === 'true' ||
            process.env.VITEST === '1' ||
            process.env.USE_TEST_DB === '1' ||
            process.env.USE_TEST_DB === 'true';

        const connectionString =
            (isTestEnv ? process.env.DATABASE_URL_TEST : undefined) ||
                process.env.DATABASE_URL;

        if (!connectionString) {
            console.error('❌ DATABASE_URL environment variable is missing!');
        }

        this.pool = new Pool({
            connectionString,
            ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
        });

        this._ensureSrpSeedColumnsPromise = null;

        // Initialize schema (check connection)
        this.initialize();
    }

    async initialize() {
        try {
            await this.pool.query('SELECT NOW()');
            console.log('[Database] Connected to PostgreSQL successfully');

            // Ensure settings table exists
            await this.createSettingsTable();
        } catch (error) {
            console.error('[Database] Failed to connect to PostgreSQL:', error);
        }
    }

    async createSettingsTable() {
        await run(this.pool, `
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id VARCHAR(255) PRIMARY KEY,
                settings JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create E2EE key bundles table
        await run(this.pool, `
            CREATE TABLE IF NOT EXISTS e2ee_key_bundles (
                user_id VARCHAR(255) PRIMARY KEY,
                identity_key TEXT NOT NULL,
                signing_key TEXT,
                fingerprint TEXT NOT NULL,
                signed_prekey_id INTEGER NOT NULL,
                signed_prekey_public TEXT NOT NULL,
                signed_prekey_signature TEXT NOT NULL,
                one_time_prekeys TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // Add signing_key column if it doesn't exist (migration for existing DBs)
        await run(this.pool, `
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='e2ee_key_bundles' AND column_name='signing_key') 
                THEN 
                    ALTER TABLE e2ee_key_bundles ADD COLUMN signing_key TEXT;
                END IF;
            END $$
        `);
        
        // Create X3DH sessions table (server-side state tracking, NO crypto material)
        await run(this.pool, `
            CREATE TABLE IF NOT EXISTS x3dh_sessions (
                session_id VARCHAR(36) PRIMARY KEY,
                initiator_user_id VARCHAR(255) NOT NULL,
                responder_user_id VARCHAR(255) NOT NULL,
                state VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE,
                retry_count INTEGER DEFAULT 0,
                last_retry_at TIMESTAMP WITH TIME ZONE,
                failure_reason VARCHAR(255),
                FOREIGN KEY (initiator_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (responder_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // sender_plaintext column auto-migration removed in privacy-l1.
        // Migration 002 drops the column; re-adding it at startup would
        // re-introduce the very plaintext leak the contract forbids.

        // Ensure SRP seed auth columns exist (for SRP login)
        await this.ensureSrpSeedColumns();
    }

    async ensureSrpSeedColumns() {
        if (this._ensureSrpSeedColumnsPromise) {
            return this._ensureSrpSeedColumnsPromise;
        }

        this._ensureSrpSeedColumnsPromise = run(this.pool, `
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'users'
                ) THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'users'
                          AND column_name = 'srp_seed_salt'
                    ) THEN
                        ALTER TABLE users ADD COLUMN srp_seed_salt TEXT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'users'
                          AND column_name = 'srp_seed_verifier'
                    ) THEN
                        ALTER TABLE users ADD COLUMN srp_seed_verifier TEXT;
                    END IF;
                END IF;
            END $$;
        `).catch((error) => {
            console.warn('[Database] Failed to ensure SRP seed columns:', error?.message || error);
        });

        return this._ensureSrpSeedColumnsPromise;
    }

    async migrate() {
        // No-op for now, assuming external migration
        // Could implement auto-migration here later
    }

    // ============================================================================
    // USER QUERIES
    // ============================================================================
    /**
     * Create a user record — public material only.
     *
     * Privacy contract (CIPHER_PRIVACY_GUARANTEES.md): the server stores
     * the username, the security tier, the SRP challenge parameters
     * (salt + verifier — non-secret), and an optional avatar hash. The
     * mnemonic, master key, DiceKey checksums, and any private key
     * material live exclusively on the user's device.
     *
     * Callers must NOT pass `mnemonic`, `master_key_hex`, or
     * `dicekey_checksums` — those columns no longer exist (migration 002).
     */
    async createUser(user) {
        await run(this.pool, `
            INSERT INTO users (id, username, security_tier, discoverable, srp_salt, srp_verifier, avatar_hash)
            VALUES ($1, $2, $3, true, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
        `, [
            user.id,
            user.username.toLowerCase(),
            user.security_tier,
            user.srp_salt || null,
            user.srp_verifier || null,
            user.avatar_hash || null,
        ]);

        return this.getUserById(user.id);
    }


    async getUserById(id) {
        return await get(this.pool, 'SELECT * FROM users WHERE id = $1', [id]);
    }

    async getUserSettings(userId) {
        const row = await get(this.pool, 'SELECT settings FROM user_settings WHERE user_id = $1', [userId]);
        return row ? row.settings : {};
    }

    async updateUserSettings(userId, settings) {
        // Merge with existing settings
        const current = await this.getUserSettings(userId);
        const newSettings = { ...current, ...settings };

        await run(this.pool, `
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET settings = $3, updated_at = NOW()
        `, [userId, newSettings, newSettings]);

        return newSettings;
    }

    async getUserByUsername(username) {
        return await get(this.pool, 'SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
    }

    async updateUserAvatarHash(userId, hash) {
        return await run(this.pool, `
            UPDATE users 
            SET avatar_hash = $1 
            WHERE id = $2
        `, [hash, userId]);
    }

    async getUserByAvatarHash(hash) {
        return await get(this.pool, 'SELECT * FROM users WHERE avatar_hash = $1', [hash]);
    }

    async searchUsers(query, currentUserId = null, limit = 10) {
        const params = [`%${query.toLowerCase()}%`];
        let sql = `
            SELECT id, username, security_tier 
            FROM users 
            WHERE username LIKE $1
            AND (discoverable = true OR discoverable IS NULL)`;

        if (currentUserId) {
            sql += ` AND id != $2`;
            params.push(currentUserId);
        }

        sql += ` ORDER BY username LIMIT $${params.length + 1}`;
        params.push(limit);

        return await all(this.pool, sql, params);
    }

    async updateUserDiscoverable(userId, discoverable) {
        return await run(this.pool, `
            UPDATE users 
            SET discoverable = $1 
            WHERE id = $2
        `, [discoverable, userId]);
    }

    async getUserDiscoverable(userId) {
        const user = await get(this.pool, `SELECT discoverable FROM users WHERE id = $1`, [userId]);
        return user ? (user.discoverable === true) : true;
    }

    // verifyMasterKey removed in privacy-l1: the server no longer holds a
    // hash of the masterKey. Login is performed via SRP (see /api/v2/auth/
    // srp/login/init + verify), which proves possession of the password
    // without ever transmitting it.

    // ============================================================================
    // CONVERSATION QUERIES
    // ============================================================================
    async createConversation(id, memberIds) {
        // Transaction for atomicity
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await run(client, `INSERT INTO conversations (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
            await run(client, `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, memberIds[0]]);
            await run(client, `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, memberIds[1]]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return this.getConversationById(id);
    }

    async getConversationById(id) {
        return await get(this.pool, 'SELECT * FROM conversations WHERE id = $1', [id]);
    }

    async getConversationMembers(conversationId) {
        const rows = await all(this.pool, `SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [conversationId]);
        return rows.map((r) => r.user_id);
    }

    async getUserConversations(userId) {
        return await all(this.pool, `
            SELECT c.* 
            FROM conversations c
            JOIN conversation_members cm ON c.id = cm.conversation_id
            WHERE cm.user_id = $1
            ORDER BY c.last_message_at DESC
        `, [userId]);
    }

    async conversationExists(id) {
        const row = await get(this.pool, 'SELECT 1 as one FROM conversations WHERE id = $1 LIMIT 1', [id]);
        return !!row;
    }

    // ============================================================================
    // CONVERSATION REQUEST QUERIES
    // ============================================================================
    async createConversationRequest(data) {
        // Privacy-l1: the `message` (free-text intro) column was dropped
        // in migration 002. The request is reduced to "from / to / status";
        // any plaintext intro must be carried E2E-encrypted as a regular
        // message after acceptance.
        await run(this.pool, `
            INSERT INTO conversation_requests (id, from_user_id, to_user_id, status)
            VALUES ($1, $2, $3, 'pending')
            ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
                status = 'pending',
                created_at = NOW()
        `, [data.id, data.from_user_id, data.to_user_id]);
        return this.getConversationRequestById(data.id);
    }

    async getConversationRequestById(id) {
        return await get(this.pool, 'SELECT * FROM conversation_requests WHERE id = $1', [id]);
    }

    async getPendingRequestsForUser(userId) {
        return await all(this.pool, `
            SELECT cr.*, u.username as from_username, u.security_tier as from_security_tier
            FROM conversation_requests cr
            JOIN users u ON cr.from_user_id = u.id
            WHERE cr.to_user_id = $1 AND cr.status = 'pending'
            ORDER BY cr.created_at DESC
        `, [userId]);
    }

    async getSentRequestsForUser(userId) {
        return await all(this.pool, `
            SELECT cr.*, u.username as to_username
            FROM conversation_requests cr
            JOIN users u ON cr.to_user_id = u.id
            WHERE cr.from_user_id = $1 AND cr.status = 'pending'
            ORDER BY cr.created_at DESC
        `, [userId]);
    }

    async updateRequestStatus(requestId, status, conversationId = null) {
        const now = new Date();
        await run(this.pool, `
            UPDATE conversation_requests 
            SET status = $1, updated_at = $2, conversation_id = $3
            WHERE id = $4
        `, [status, now, conversationId, requestId]);
    }

    async checkExistingRequest(fromUserId, toUserId) {
        return await get(this.pool, `
            SELECT * FROM conversation_requests 
            WHERE (from_user_id = $1 AND to_user_id = $2) 
               OR (from_user_id = $3 AND to_user_id = $4)
        `, [fromUserId, toUserId, toUserId, fromUserId]);
    }

    // ============================================================================
    // MESSAGE QUERIES
    // ============================================================================
    /**
     * Insert a message envelope.
     *
     * Privacy contract: `body` is opaque ciphertext. The server has no
     * means (and no need) to decrypt it. The sender keeps their own
     * readable copy locally — historically this was duplicated as
     * `sender_plaintext` on the row, but that column was dropped in
     * migration 002 (privacy-l1). The sender now stores a self-addressed
     * ciphertext locally via selfEncryptingMessage.ts, indistinguishable
     * to the server from a regular message.
     */
    async createMessage(message) {
        // Convert JS timestamp (milliseconds) to PostgreSQL timestamp
        const scheduledBurnAt = message.scheduled_burn_at
            ? new Date(message.scheduled_burn_at)
            : null;

        await run(this.pool, `
            INSERT INTO messages (id, conversation_id, sender_id, body, unlock_block_height, scheduled_burn_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            message.id,
            message.conversation_id,
            message.sender_id,
            message.body,
            message.unlock_block_height || null,
            scheduledBurnAt,
        ]);
        return this.getMessageById(message.id);
    }

    async getMessageById(id) {
        return await get(this.pool, 'SELECT * FROM messages WHERE id = $1', [id]);
    }

    /**
     * Mark messages as delivered for a recipient who just fetched them.
     * Privacy-l1 contract: once a message is marked delivered, the purge
     * worker will drop it after BRIDGE_MESSAGE_TTL_DAYS (default 7).
     *
     * Strategy: for 1-to-1 conversations (the common case), mark
     * `delivered_at = NOW()` as soon as the (single) recipient fetches.
     * For group conversations (>2 members), per-recipient tracking is
     * required — deferred until groups become a real product surface.
     *
     * Idempotent: skips messages already marked delivered.
     * Best-effort: logs failures but never throws into the request path.
     *
     * @param {string} conversationId
     * @param {string} recipientUserId   The user who just GET-ed the conversation
     * @returns {Promise<number>}        How many messages were newly marked
     */
    async markMessagesDeliveredFor(conversationId, recipientUserId) {
        try {
            // Group support: count members. If >2, defer (per-recipient ack
            // needed). If exactly 2, the recipient is the only "other" party
            // and a single fetch ack-es the whole conversation worth of
            // pending messages.
            const memberCountRow = await get(
                this.pool,
                'SELECT COUNT(*)::int AS n FROM conversation_members WHERE conversation_id = $1',
                [conversationId]
            );
            const memberCount = memberCountRow?.n ?? 0;
            if (memberCount !== 2) {
                // TODO(privacy-l1, groups): introduce a message_deliveries
                // junction table to track per-recipient acks for groups,
                // then set messages.delivered_at when the set covers all
                // recipients (excluding sender).
                return 0;
            }

            const result = await run(this.pool, `
                UPDATE messages
                SET delivered_at = NOW()
                WHERE conversation_id = $1
                  AND sender_id <> $2
                  AND delivered_at IS NULL
            `, [conversationId, recipientUserId]);

            return result?.rowCount ?? 0;
        } catch (error) {
            console.warn(
                '[Database] markMessagesDeliveredFor failed:',
                error?.message || error
            );
            return 0;
        }
    }

    async getConversationMessages(conversationId, limit = 100) {
        // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
        return await all(this.pool, `
            SELECT * FROM messages 
            WHERE conversation_id = $1 
              AND (is_burned = false OR is_burned IS NULL)
            ORDER BY created_at ASC 
            LIMIT $2
        `, [conversationId, limit]);
    }

    async getConversationMessagesPaged(conversationId, before, limit) {
        // Convert JS timestamp (milliseconds) to PostgreSQL timestamp
        // to_timestamp expects seconds, so divide by 1000
        // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
        return await all(this.pool, `
            SELECT * FROM messages 
            WHERE conversation_id = $1 
              AND created_at < to_timestamp($2 / 1000.0)
              AND (is_burned = false OR is_burned IS NULL)
            ORDER BY created_at DESC
            LIMIT $3
        `, [conversationId, before, limit]);
    }

    async getLastMessage(conversationId) {
        // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
        return await get(this.pool, `
            SELECT * FROM messages 
            WHERE conversation_id = $1 
              AND (is_burned = false OR is_burned IS NULL)
            ORDER BY created_at DESC 
            LIMIT 1
        `, [conversationId]);
    }

    async burnMessage(messageId, burnedAt = Date.now()) {
        // If this message contains an attachment reference, delete the ciphertext from disk.
        // (The attachment is already encrypted client-side; deletion here is lifecycle management.)
        try {
            const msgRow = await get(this.pool, 'SELECT body FROM messages WHERE id = $1', [messageId]);
            const body = msgRow?.body;

            if (typeof body === 'string') {
                let parsed;
                try {
                    parsed = JSON.parse(body);
                }
                catch {
                    parsed = null;
                }

                const remoteAttachmentId = parsed?.type === 'attachment'
                    ? (parsed?.payload?.remoteAttachmentId || parsed?.payload?.remote_attachment_id)
                    : null;

                if (remoteAttachmentId && typeof remoteAttachmentId === 'string') {
                    const deleted = await this.deleteAttachment(remoteAttachmentId);
                    const filePath = deleted?.path;
                    if (filePath && typeof filePath === 'string') {
                        try {
                            unlinkSync(filePath);
                        }
                        catch {
                            // Ignore missing file
                        }
                    }
                }
            }
        }
        catch {
            // Never block burning on attachment cleanup.
        }

        // Burn After Reading: physical deletion.
        // Once burned, the ciphertext/record should not be recoverable by reconnecting.
        await run(this.pool, `DELETE FROM messages WHERE id = $1`, [messageId]);
    }

    async deleteMessage(messageId) {
        await run(this.pool, `DELETE FROM messages WHERE id = $1`, [messageId]);
    }

    async deleteAttachment(attachmentId) {
        const row = await get(this.pool, `DELETE FROM attachments WHERE id = $1 RETURNING *`, [attachmentId]);
        return row;
    }

    async scheduleBurn(messageId, when) {
        const scheduledAt = typeof when === 'number' ? new Date(when) : when;
        await run(this.pool, `UPDATE messages SET scheduled_burn_at = $1 WHERE id = $2`, [scheduledAt, messageId]);
    }

    async getScheduledBurnsDue(now = new Date()) {
        return await all(this.pool, `
            SELECT id, conversation_id FROM messages
            WHERE is_burned = false AND scheduled_burn_at IS NOT NULL AND scheduled_burn_at <= $1
        `, [now]);
    }

    async getPendingBurns() {
        // Return scheduled burns with positive timestamps (absolute time)
        // Negative values are delays (calculated on acknowledge)
        const rows = await all(this.pool, `
            SELECT id as "messageId", conversation_id as "conversationId", scheduled_burn_at as "scheduledBurnAt"
            FROM messages
            WHERE is_burned = false 
              AND scheduled_burn_at IS NOT NULL 
              AND scheduled_burn_at > to_timestamp(0)
        `);
        return rows;
    }

    // ============================================================================
    // METADATA QUERIES
    // ============================================================================
    async getMetadata(key) {
        const row = await get(this.pool, 'SELECT value FROM metadata WHERE key = $1', [key]);
        return row?.value || null;
    }

    async setMetadata(key, value) {
        const now = new Date();
        await run(this.pool, `
            INSERT INTO metadata (key, value, updated_at) 
            VALUES ($1, $2, $3)
            ON CONFLICT(key) DO UPDATE SET value = $4, updated_at = $5
        `, [key, value, now, value, now]);
    }

    // ============================================================================
    // REFRESH_TOKENS QUERIES
    // ============================================================================
    async createRefreshToken(data) {
        await run(this.pool, `
            INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [data.id, data.user_id, data.token_hash, new Date(data.expires_at), data.user_agent || null, data.ip_address || null]);
        return this.getRefreshTokenById(data.id);
    }

    async getRefreshTokenById(id) {
        return await get(this.pool, 'SELECT * FROM refresh_tokens WHERE id = $1', [id]);
    }

    async getRefreshTokenByHash(token_hash) {
        return await get(this.pool, `
            SELECT * FROM refresh_tokens 
            WHERE token_hash = $1 AND revoked = false AND expires_at > $2
        `, [token_hash, new Date()]);
    }

    async updateRefreshTokenLastUsed(id) {
        await run(this.pool, `UPDATE refresh_tokens SET last_used_at = $1 WHERE id = $2`, [new Date(), id]);
    }

    async revokeRefreshToken(id) {
        await run(this.pool, `UPDATE refresh_tokens SET revoked = true, revoked_at = $1 WHERE id = $2`, [new Date(), id]);
    }

    async revokeAllUserRefreshTokens(user_id) {
        await run(this.pool, `UPDATE refresh_tokens SET revoked = true, revoked_at = $1 WHERE user_id = $2 AND revoked = false`, [new Date(), user_id]);
    }

    async cleanupExpiredRefreshTokens() {
        const result = await run(this.pool, `DELETE FROM refresh_tokens WHERE expires_at < $1 OR revoked = true`, [new Date()]);
        return result.rowCount;
    }

    // ============================================================================
    // ATTACHMENTS QUERIES
    // ============================================================================
    async createAttachment(data) {
        await run(this.pool, `
            INSERT INTO attachments (id, conversation_id, uploader_id, filename, mime, size, path)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [data.id, data.conversation_id, data.uploader_id, data.filename, data.mime, data.size, data.path]);
        return this.getAttachmentById(data.id);
    }

    async getAttachmentById(id) {
        return await get(this.pool, 'SELECT * FROM attachments WHERE id = $1', [id]);
    }

    // ============================================================================
    // AUDIT LOGS — REMOVED in privacy-l1 (migration 004)
    // ============================================================================
    // The audit_logs table was dropped because a queryable persistent log
    // of authentication events is itself a metadata leak. Operational
    // visibility on active incidents now comes from the in-memory ring
    // buffer in services/security-events.ts (bounded, restart-wiped,
    // PII-free). Health/audit admin endpoints read from there.

    // ============================================================================
    // DICEKEY PUBLIC KEYS
    // ============================================================================
    async saveIdentityKey(userId, publicKey, fingerprint) {
        await run(this.pool, `
            INSERT INTO identity_keys (user_id, public_key, fingerprint)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, public_key) DO NOTHING
        `, [userId, publicKey, fingerprint]);
        return await get(this.pool, 'SELECT * FROM identity_keys WHERE user_id = $1 AND public_key = $2', [userId, publicKey]);
    }

    async saveSignatureKey(userId, publicKey, fingerprint) {
        await run(this.pool, `
            INSERT INTO signature_keys (user_id, public_key, fingerprint)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, public_key) DO NOTHING
        `, [userId, publicKey, fingerprint]);
        return await get(this.pool, 'SELECT * FROM signature_keys WHERE user_id = $1 AND public_key = $2', [userId, publicKey]);
    }

    async saveSignedPreKey(userId, keyId, publicKey, signature, timestamp) {
        await run(this.pool, `
            INSERT INTO signed_pre_keys (user_id, key_id, public_key, signature, timestamp)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, key_id) DO UPDATE SET public_key = $6, signature = $7, timestamp = $8
        `, [userId, keyId, publicKey, signature, timestamp, publicKey, signature, timestamp]);
        return await get(this.pool, 'SELECT * FROM signed_pre_keys WHERE user_id = $1 AND key_id = $2', [userId, keyId]);
    }

    async saveOneTimePreKeys(userId, keys) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const key of keys) {
                await run(client, `
                    INSERT INTO one_time_pre_keys (user_id, key_id, public_key)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, key_id) DO NOTHING
                `, [userId, key.keyId, key.publicKey]);
            }
            await client.query('COMMIT');
            return keys.length;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async getIdentityKey(userId) {
        return await get(this.pool, 'SELECT * FROM identity_keys WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1', [userId]);
    }

    async getIdentityKeyByPublicKey(publicKey) {
        return await get(this.pool, 'SELECT * FROM identity_keys WHERE public_key = $1 AND is_active = true LIMIT 1', [publicKey]);
    }

    async getSignatureKey(userId) {
        return await get(this.pool, 'SELECT * FROM signature_keys WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1', [userId]);
    }

    async getSignedPreKey(userId) {
        return await get(this.pool, 'SELECT * FROM signed_pre_keys WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1', [userId]);
    }

    async getUnusedOneTimePreKey(userId) {
        return await get(this.pool, 'SELECT * FROM one_time_pre_keys WHERE user_id = $1 AND used_at IS NULL ORDER BY key_id LIMIT 1', [userId]);
    }

    async markOneTimePreKeyAsUsed(keyId, usedBy) {
        await run(this.pool, `
            UPDATE one_time_pre_keys
            SET used_at = NOW(), used_by = $1
            WHERE id = $2
        `, [usedBy, keyId]);
    }

    async getOneTimePreKeysCount(userId, unused = true) {
        const condition = unused ? 'AND used_at IS NULL' : '';
        const row = await get(this.pool, `SELECT COUNT(*) as count FROM one_time_pre_keys WHERE user_id = $1 ${condition}`, [userId]);
        return parseInt(row?.count || 0);
    }

    async getAllPublicKeys(userId) {
        const identity = await this.getIdentityKey(userId);
        const signature = await this.getSignatureKey(userId);
        const signedPreKey = await this.getSignedPreKey(userId);
        const unusedOtkCount = await this.getOneTimePreKeysCount(userId, true);
        return {
            identityKey: identity,
            signatureKey: signature,
            signedPreKey: signedPreKey,
            oneTimePreKeysCount: unusedOtkCount
        };
    }

    close() {
        this.pool.end();
        console.log('[Database] Connection closed');
    }

    async clearAll() {
        // Dangerous!
        // Explicit opt-in required to avoid accidental wipes of a real database.
        if (process.env.ALLOW_DESTRUCTIVE_DB_OPS !== '1' && process.env.ALLOW_DESTRUCTIVE_DB_OPS !== 'true') {
            throw new Error('Refusing to clear DB: set ALLOW_DESTRUCTIVE_DB_OPS=1 to allow TRUNCATE');
        }

        await run(this.pool, 'TRUNCATE TABLE messages, conversation_members, conversations, users CASCADE');
        console.log('[Database] All data cleared');
    }

    async backupDatabase(backupPath) {
        console.warn('[Database] backupDatabase not supported in Postgres mode. Use pg_dump.');
        return false;
    }

    async exportUserData(userId) {
        try {
            // Get user's conversations
            const conversations = await this.getUserConversations(userId);
            const conversationIds = conversations.map(c => c.id);

            // Get messages for these conversations
            let messages = [];
            for (const convId of conversationIds) {
                const convMessages = await this.getConversationMessages(convId, 10000); // Reasonable limit?
                messages = messages.concat(convMessages);
            }

            // Get settings
            const settings = await this.getUserSettings(userId);

            return {
                version: 1,
                timestamp: new Date().toISOString(),
                userId,
                settings,
                conversations,
                messages
            };
        } catch (error) {
            console.error('[Database] Export user data failed:', error);
            throw error;
        }
    }

    /**
     * Restore a user's backup produced by `exportUserData`.
     *
     * Contract:
     * - Caller has already verified that `data.userId === userId` (cross-account
     *   guard in /api/backup/import). This method trusts that check.
     * - Atomic: wraps everything in a transaction, rolls back on any failure.
     * - Idempotent: dedup by conversation.id and message.id, `ON CONFLICT DO NOTHING`.
     *   Re-running the same import yields zero new rows.
     * - Timelock fields (`unlock_block_height`, `scheduled_burn_at`, `created_at`)
     *   are preserved verbatim so the Burn Scheduler can re-pick up timers at boot
     *   and Bitcoin-height unlocks resolve against their original target.
     *
     * Messages whose `conversation_id` is neither in the backup's conversations
     * nor already owned by the user are skipped — a defensive filter against a
     * malformed backup trying to plant messages in someone else's thread.
     */
    async restoreUserData(userId, data) {
        const stats = {
            conversationsCreated: 0,
            conversationsSkipped: 0,
            messagesRestored: 0,
            messagesSkipped: 0,
        };

        const existingConvs = await this.getUserConversations(userId);
        const allowedConvIds = new Set(existingConvs.map((c) => c.id));

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Phase 1 — recreate missing conversations using the senders
            // present in the backup messages as the member list. Best effort:
            // if we can't infer at least one other participant we still keep
            // the user as a sole member so messages attach somewhere.
            for (const conv of (data.conversations || [])) {
                if (!conv || !conv.id) continue;
                if (allowedConvIds.has(conv.id)) {
                    stats.conversationsSkipped++;
                    continue;
                }
                const convMessages = (data.messages || []).filter(
                    (m) => m && m.conversation_id === conv.id
                );
                const senderIds = Array.from(
                    new Set(convMessages.map((m) => m.sender_id).filter(Boolean))
                );
                if (!senderIds.includes(userId)) senderIds.push(userId);
                const members = senderIds.slice(0, 2);

                await run(
                    client,
                    `INSERT INTO conversations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
                    [conv.id]
                );
                for (const m of members) {
                    await run(
                        client,
                        `INSERT INTO conversation_members (conversation_id, user_id)
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [conv.id, m]
                    );
                }
                allowedConvIds.add(conv.id);
                stats.conversationsCreated++;
            }

            // Phase 2 — replay messages, preserving every timelock-relevant
            // column. ON CONFLICT DO NOTHING makes the import idempotent.
                for (const msg of (data.messages || [])) {
                if (!msg || !msg.id || !msg.conversation_id) continue;
                if (!allowedConvIds.has(msg.conversation_id)) {
                    stats.messagesSkipped++;
                    continue;
                }
                const scheduledBurnAt = msg.scheduled_burn_at
                    ? new Date(msg.scheduled_burn_at)
                    : null;
                const createdAt = msg.created_at
                    ? new Date(msg.created_at)
                    : null;
                const before = stats.messagesRestored;
                // sender_plaintext column dropped in privacy-l1 (migration 002).
                // Old backups containing this field have it ignored on restore.
                const result = await client.query(
                    `INSERT INTO messages
                        (id, conversation_id, sender_id, body,
                         unlock_block_height, scheduled_burn_at, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        msg.id,
                        msg.conversation_id,
                        msg.sender_id,
                        msg.body,
                        msg.unlock_block_height || null,
                        scheduledBurnAt,
                        createdAt,
                    ]
                );
                if (result.rowCount && result.rowCount > 0) {
                    stats.messagesRestored++;
                } else {
                    stats.messagesSkipped++;
                }
                void before;
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return stats;
    }

    getDatabasePath() {
        return 'postgres';
    }

    async getStats() {
        try {
            const users = await get(this.pool, 'SELECT COUNT(*) as count FROM users');
            const conversations = await get(this.pool, 'SELECT COUNT(*) as count FROM conversations');
            const messages = await get(this.pool, 'SELECT COUNT(*) as count FROM messages');
            const attachments = await get(this.pool, 'SELECT COUNT(*) as count FROM attachments');
            return {
                users: parseInt(users?.count || 0),
                conversations: parseInt(conversations?.count || 0),
                messages: parseInt(messages?.count || 0),
                attachments: parseInt(attachments?.count || 0),
                databasePath: this.getDatabasePath()
            };
        }
        catch (error) {
            console.error('[Database] Failed to get stats:', error);
            return {
                users: 0,
                conversations: 0,
                messages: 0,
                attachments: 0,
                databasePath: this.getDatabasePath(),
                error: error.message
            };
        }
    }

    async updateUsername(userId, newUsername) {
        await run(this.pool, `UPDATE users SET username = $1 WHERE id = $2`, [newUsername.toLowerCase(), userId]);
    }

    async updateUserSRP(userId, salt, verifier) {
        await run(this.pool, `UPDATE users SET srp_salt = $1, srp_verifier = $2 WHERE id = $3`, [salt, verifier, userId]);
    }

    async updateUserSRPSeed(userId, salt, verifier) {
        await run(this.pool, `UPDATE users SET srp_seed_salt = $1, srp_seed_verifier = $2 WHERE id = $3`, [salt, verifier, userId]);
    }

    async exec(sql) {
        return await this.pool.query(sql);
    }
    // ============================================================================
    // E2EE KEY BUNDLE QUERIES
    // ============================================================================
    async getE2eeKeyBundle(userId) {
        return await get(this.pool, 'SELECT * FROM e2ee_key_bundles WHERE user_id = $1', [userId]);
    }

    async upsertE2eeKeyBundle(userId, keyBundle) {
        const existing = await this.getE2eeKeyBundle(userId);

        if (existing) {
            await run(this.pool, `
                UPDATE e2ee_key_bundles
                SET identity_key = $1,
                    signing_key = $2,
                    fingerprint = $3,
                    signed_prekey_id = $4,
                    signed_prekey_public = $5,
                    signed_prekey_signature = $6,
                    one_time_prekeys = $7,
                    updated_at = NOW()
                WHERE user_id = $8
            `, [
                keyBundle.identityKey,
                keyBundle.signingKey || null, // Ed25519 public key for SPK verification
                keyBundle.fingerprint,
                keyBundle.signedPreKey.keyId,
                keyBundle.signedPreKey.publicKey,
                keyBundle.signedPreKey.signature,
                JSON.stringify(keyBundle.oneTimePreKeys),
                userId
            ]);
        } else {
            await run(this.pool, `
                INSERT INTO e2ee_key_bundles (
                    user_id, identity_key, signing_key, fingerprint,
                    signed_prekey_id, signed_prekey_public, signed_prekey_signature,
                    one_time_prekeys, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            `, [
                userId,
                keyBundle.identityKey,
                keyBundle.signingKey || null, // Ed25519 public key for SPK verification
                keyBundle.fingerprint,
                keyBundle.signedPreKey.keyId,
                keyBundle.signedPreKey.publicKey,
                keyBundle.signedPreKey.signature,
                JSON.stringify(keyBundle.oneTimePreKeys)
            ]);
        }
    }

    async getE2eeKeyBundleByUsername(username) {
        const user = await this.getUserByUsername(username);
        if (!user) return null;
        return await this.getE2eeKeyBundle(user.id);
    }

    async getE2eeKeyBundleByUserId(userId) {
        return await this.getE2eeKeyBundle(userId);
    }

    async updateOneTimePreKeys(userId, oneTimePreKeysJson) {
        await run(this.pool, `
            UPDATE e2ee_key_bundles
            SET one_time_prekeys = $1, updated_at = NOW()
            WHERE user_id = $2
        `, [oneTimePreKeysJson, userId]);
    }

    // ============================================================================
    // X3DH SESSION QUERIES (Server-side state tracking only - NO crypto material)
    // ============================================================================

    async createX3DHSession(sessionId, initiatorUserId, responderUserId) {
        await run(this.pool, `
            INSERT INTO x3dh_sessions (session_id, initiator_user_id, responder_user_id, state, created_at, updated_at)
            VALUES ($1, $2, $3, 'PENDING', NOW(), NOW())
            ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()
        `, [sessionId, initiatorUserId, responderUserId]);
    }

    async getX3DHSession(sessionId) {
        return await get(this.pool, 'SELECT * FROM x3dh_sessions WHERE session_id = $1', [sessionId]);
    }

    async getX3DHSessionBetweenUsers(userId1, userId2) {
        return await get(this.pool, `
            SELECT * FROM x3dh_sessions 
            WHERE ((initiator_user_id = $1 AND responder_user_id = $2) 
                OR (initiator_user_id = $2 AND responder_user_id = $1))
            AND state IN ('PENDING', 'ACTIVE')
            ORDER BY created_at DESC
            LIMIT 1
        `, [userId1, userId2]);
    }

    async updateX3DHSessionState(sessionId, state, failureReason = null) {
        await run(this.pool, `
            UPDATE x3dh_sessions 
            SET state = $2, failure_reason = $3, updated_at = NOW()
            WHERE session_id = $1
        `, [sessionId, state, failureReason]);
    }

    async incrementX3DHSessionRetry(sessionId) {
        await run(this.pool, `
            UPDATE x3dh_sessions 
            SET retry_count = retry_count + 1, last_retry_at = NOW(), updated_at = NOW()
            WHERE session_id = $1
        `, [sessionId]);
    }

    async deleteX3DHSession(sessionId) {
        await run(this.pool, 'DELETE FROM x3dh_sessions WHERE session_id = $1', [sessionId]);
    }

    async cleanupExpiredX3DHSessions() {
        await run(this.pool, `
            UPDATE x3dh_sessions 
            SET state = 'EXPIRED', updated_at = NOW()
            WHERE expires_at IS NOT NULL AND expires_at < NOW() AND state = 'PENDING'
        `);
    }

    // ========================================================================
    // PUBLIC KEY MANAGEMENT (e2ee-v2)
    // ========================================================================

    /**
     * Get public keys for multiple users
     * @param {string[]} userIds - Array of user IDs
     * @returns {Promise<Array>} Array of {user_id, username, public_key, sign_public_key}
     */
    async getPublicKeysByUserIds(userIds) {
        if (!userIds || userIds.length === 0) {
            return [];
        }

        // Create placeholders for parameterized query
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');

        // Source of truth: users.public_key / users.sign_public_key (written by
        // PUT /users/me/public-keys via uploadPublicKeys). Fall back to the
        // e2ee_key_bundles row for legacy accounts that only published an X3DH
        // bundle and never hit the simple key-upload endpoint. Without the
        // fallback, call signature verification fails with "peer signPublicKey
        // unavailable" because the previous query read columns that the
        // simple-upload flow never writes to.
        const rows = await all(
            this.pool,
            `SELECT u.id as user_id, u.username,
                    COALESCE(u.public_key, ekb.identity_key) as public_key,
                    COALESCE(u.sign_public_key, ekb.signing_key) as sign_public_key
             FROM users u
             LEFT JOIN e2ee_key_bundles ekb ON u.id = ekb.user_id
             WHERE u.id IN (${placeholders})`,
            userIds
        );

        return rows;
    }

    /**
     * Update user's public keys
     * @param {string} userId - User ID
     * @param {string} publicKey - Base64 encoded Curve25519 public key
     * @param {string} signPublicKey - Base64 encoded Ed25519 public key
     */
    async updateUserPublicKeys(userId, publicKey, signPublicKey) {
        await run(
            this.pool,
            `UPDATE users 
             SET public_key = $1, sign_public_key = $2, updated_at = NOW() 
             WHERE id = $3`,
            [publicKey, signPublicKey, userId]
        );
    }

    /**
     * Check if user is a member of a conversation
     * @param {string} conversationId - Conversation ID
     * @param {string} userId - User ID
     * @returns {Promise<boolean>}
     */
    async isConversationMember(conversationId, userId) {
        const result = await get(
            this.pool,
            `SELECT 1 FROM conversation_members 
             WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, userId]
        );

        return result !== undefined;
    }

    /**
     * Get all members of a conversation with their public keys
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Array>} Array of {user_id, username, public_key, sign_public_key}
     */
    async getConversationMembersWithKeys(conversationId) {
        // Same column-source issue as getPublicKeysByUserIds: prefer
        // users.public_key / users.sign_public_key (written by the simple
        // upload flow) and fall back to e2ee_key_bundles for legacy accounts.
        const rows = await all(
            this.pool,
            `SELECT u.id as user_id, u.username,
                    COALESCE(u.public_key, ekb.identity_key) as public_key,
                    COALESCE(u.sign_public_key, ekb.signing_key) as sign_public_key
             FROM conversation_members cm
             JOIN users u ON cm.user_id = u.id
             LEFT JOIN e2ee_key_bundles ekb ON u.id = ekb.user_id
             WHERE cm.conversation_id = $1`,
            [conversationId]
        );

        return rows;
    }
}

let dbInstance = null;
export function getDatabase(dbPath) {
    if (!dbInstance) {
        dbInstance = new DatabaseService(dbPath);
    }
    return dbInstance;
}

export function closeDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

export { DatabaseService };
