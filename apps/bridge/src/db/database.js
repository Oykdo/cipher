import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import argon2 from 'argon2';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

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

function encryptMnemonic(mnemonicJson, masterKeyHex) {
    try {
        if (!masterKeyHex) {
            return mnemonicJson;
        }
        const salt = randomBytes(16);
        const key = scryptSync(Buffer.from(masterKeyHex, 'hex'), salt, 32);
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([cipher.update(mnemonicJson, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return JSON.stringify({ v: 1, alg: 'AES-256-GCM', s: salt.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') });
    }
    catch {
        return mnemonicJson;
    }
}

function decryptMnemonic(encryptedJson, masterKeyHex) {
    try {
        if (!masterKeyHex || !encryptedJson) {
            return encryptedJson;
        }
        // Check if it's encrypted format
        if (typeof encryptedJson === 'string' && !encryptedJson.startsWith('{')) {
            return encryptedJson; // Plain text
        }

        // Handle JSONB object from Postgres
        const data = typeof encryptedJson === 'string' ? JSON.parse(encryptedJson) : encryptedJson;

        if (data.v !== 1 || data.alg !== 'AES-256-GCM') {
            return encryptedJson; // Unknown format
        }
        const salt = Buffer.from(data.s, 'base64');
        const key = scryptSync(Buffer.from(masterKeyHex, 'hex'), salt, 32);
        const iv = Buffer.from(data.iv, 'base64');
        const tag = Buffer.from(data.tag, 'base64');
        const ct = Buffer.from(data.ct, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch (error) {
        console.error('[Database] Failed to decrypt mnemonic:', error.message);
        return encryptedJson; // Return encrypted if decryption fails
    }
}

class DatabaseService {
    constructor(dbPath) {
        // dbPath is ignored for Postgres, using env var
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            console.error('❌ DATABASE_URL environment variable is missing!');
        }

        this.pool = new Pool({
            connectionString,
            ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
        });

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
    }

    async migrate() {
        // No-op for now, assuming external migration
        // Could implement auto-migration here later
    }

    // ============================================================================
    // USER QUERIES
    // ============================================================================
    async createUser(user) {
        const mnemonicJson = JSON.stringify(typeof user.mnemonic === 'string' ? JSON.parse(user.mnemonic) : user.mnemonic);
        const encMnemonic = encryptMnemonic(mnemonicJson, user.master_key_hex);

        // Encrypt DiceKey checksums if provided
        let encryptedChecksums = null;
        if (user.dicekey_checksums && Array.isArray(user.dicekey_checksums)) {
            const checksumsJson = JSON.stringify(user.dicekey_checksums);
            encryptedChecksums = encryptMnemonic(checksumsJson, user.master_key_hex);
        }

        let hashedMasterKey = null;
        if (user.master_key_hex) {
            hashedMasterKey = await argon2.hash(user.master_key_hex, {
                type: argon2.argon2id,
                memoryCost: 65536,
                timeCost: 3,
                parallelism: 4
            });
        }

        await run(this.pool, `
            INSERT INTO users (id, username, security_tier, mnemonic, master_key_hex, discoverable, srp_salt, srp_verifier, avatar_hash, dicekey_checksums)
            VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
        `, [user.id, user.username.toLowerCase(), user.security_tier, encMnemonic, hashedMasterKey, user.srp_salt || null, user.srp_verifier || null, user.avatar_hash || null, encryptedChecksums]);

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

    async verifyMasterKey(userId, masterKeyHex) {
        const user = await this.getUserById(userId);
        if (!user || !user.master_key_hex) {
            return false;
        }
        try {
            return await argon2.verify(user.master_key_hex, masterKeyHex);
        }
        catch (error) {
            console.error('[Database] Master key verification failed:', error);
            return false;
        }
    }

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
        await run(this.pool, `
            INSERT INTO conversation_requests (id, from_user_id, to_user_id, message, status)
            VALUES ($1, $2, $3, $4, 'pending')
            ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
                status = 'pending',
                message = EXCLUDED.message,
                created_at = NOW()
        `, [data.id, data.from_user_id, data.to_user_id, data.message || null]);
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
            scheduledBurnAt
        ]);
        return this.getMessageById(message.id);
    }

    async getMessageById(id) {
        return await get(this.pool, 'SELECT * FROM messages WHERE id = $1', [id]);
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

    async burnMessage(messageId, burnedAt = new Date()) {
        await run(this.pool, `
            UPDATE messages 
            SET is_burned = true, burned_at = $1, body = '[Message détruit]', scheduled_burn_at = NULL
            WHERE id = $2
        `, [burnedAt, messageId]);
    }

    async scheduleBurn(messageId, when) {
        await run(this.pool, `UPDATE messages SET scheduled_burn_at = $1 WHERE id = $2`, [when, messageId]);
    }

    async getScheduledBurnsDue(now = new Date()) {
        return await all(this.pool, `
            SELECT id, conversation_id FROM messages
            WHERE is_burned = false AND scheduled_burn_at IS NOT NULL AND scheduled_burn_at <= $1
        `, [now]);
    }

    async getPendingBurns() {
        const rows = await all(this.pool, `
            SELECT id as "messageId", conversation_id as "conversationId", scheduled_burn_at as "scheduledBurnAt"
            FROM messages
            WHERE is_burned = false AND scheduled_burn_at IS NOT NULL AND scheduled_burn_at > $1
        `, [new Date()]);
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
    // AUDIT_LOGS QUERIES
    // ============================================================================
    async createAuditLog(data) {
        await run(this.pool, `
            INSERT INTO audit_logs (
                id, user_id, action, table_name, record_id, 
                old_values, new_values, ip_address, user_agent, severity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [data.id, data.user_id || null, data.action, data.table_name, data.record_id || null, data.old_values || null, data.new_values || null, data.ip_address || null, data.user_agent || null, data.severity || 'INFO']);
    }

    async getAuditLogs(options = {}) {
        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];
        if (options.userId) {
            query += ` AND user_id = $${params.length + 1}`;
            params.push(options.userId);
        }
        if (options.tableName) {
            query += ` AND table_name = $${params.length + 1}`;
            params.push(options.tableName);
        }
        if (options.action) {
            query += ` AND action = $${params.length + 1}`;
            params.push(options.action);
        }
        if (options.severity) {
            query += ` AND severity = $${params.length + 1}`;
            params.push(options.severity);
        }
        if (options.startTime) {
            query += ` AND timestamp >= $${params.length + 1}`;
            params.push(options.startTime);
        }
        if (options.endTime) {
            query += ` AND timestamp <= $${params.length + 1}`;
            params.push(options.endTime);
        }
        query += ' ORDER BY timestamp DESC';
        if (options.limit) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(options.limit);
            if (options.offset) {
                query += ` OFFSET $${params.length + 1}`;
                params.push(options.offset);
            }
        }
        return await all(this.pool, query, params);
    }

    async getAuditStats() {
        const total = await get(this.pool, 'SELECT COUNT(*) as count FROM audit_logs');
        const last24h = await get(this.pool, `SELECT COUNT(*) as count FROM audit_logs WHERE timestamp > $1`, [new Date(Date.now() - 24 * 60 * 60 * 1000)]);
        const bySeverityRows = await all(this.pool, `SELECT severity, COUNT(*) as count FROM audit_logs GROUP BY severity`);
        const bySeverity = Object.fromEntries(bySeverityRows.map((s) => [s.severity, s.count]));
        const byAction = await all(this.pool, `
            SELECT action, COUNT(*) as count 
            FROM audit_logs 
            WHERE timestamp > $1
            GROUP BY action 
            ORDER BY count DESC 
            LIMIT 10
        `, [new Date(Date.now() - 24 * 60 * 60 * 1000)]);
        const criticalRecent = await get(this.pool, `SELECT COUNT(*) as count FROM audit_logs WHERE severity = 'CRITICAL' AND timestamp > $1`, [new Date(Date.now() - 24 * 60 * 60 * 1000)]);

        return {
            users: parseInt((await get(this.pool, 'SELECT COUNT(*) as count FROM users')).count),
            conversations: parseInt((await get(this.pool, 'SELECT COUNT(*) as count FROM conversations')).count),
            messages: parseInt((await get(this.pool, 'SELECT COUNT(*) as count FROM messages')).count),
            auditLogs: parseInt(total.count),
            schemaVersion: await this.getMetadata('schema_version'),
            last24h: parseInt(last24h.count),
            bySeverity,
            topActions: byAction,
            criticalLast24h: parseInt(criticalRecent.count),
        };
    }

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

    async updateUserSRP(userId, salt, verifier) {
        await run(this.pool, `UPDATE users SET srp_salt = $1, srp_verifier = $2 WHERE id = $3`, [salt, verifier, userId]);
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

export { DatabaseService, decryptMnemonic };
