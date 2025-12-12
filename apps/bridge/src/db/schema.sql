-- Dead Drop Messenger - Database Schema (SQLite)
-- Version: 1.1.0
-- Created: 2025-10-26

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- UUID
  username TEXT UNIQUE NOT NULL,          -- Nom d'utilisateur (unique, lowercase)
  security_tier TEXT NOT NULL,            -- 'standard' | 'dice-key'
  mnemonic TEXT NOT NULL,                 -- JSON array de mots mnémoniques
  master_key_hex TEXT,                    -- Clé maître hex (Dice-Key seulement)
  avatar_hash TEXT,                       -- SHA-256 hash of the generated avatar .blend file
  dicekey_checksums TEXT,                 -- Encrypted JSON array of 30 hex checksums (DiceKey only)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Index pour recherche rapide par username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index pour créatedAt (tri chronologique)
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,                    -- Format: "userId1:userId2" (sorted)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  last_message_id TEXT,                   -- ID du dernier message (FK vers messages)
  last_message_at INTEGER                 -- Timestamp dernier message (pour tri)
);

-- Index pour tri par dernier message
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================================================
-- CONVERSATION_MEMBERS TABLE (Junction table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour retrouver conversations d'un user rapidement
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);

-- ============================================================================
-- E2EE KEY BUNDLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS e2ee_key_bundles (
  user_id TEXT PRIMARY KEY,                   -- User ID (FK vers users)
  identity_key TEXT NOT NULL,                 -- Public identity key X25519 (base64) for DH
  signing_key TEXT,                           -- Ed25519 public key (base64) for SPK verification
  fingerprint TEXT NOT NULL,                  -- Key fingerprint (SHA-256 hash)
  signed_prekey_id INTEGER NOT NULL,          -- Signed prekey ID
  signed_prekey_public TEXT NOT NULL,         -- Signed prekey public (base64)
  signed_prekey_signature TEXT NOT NULL,      -- Ed25519 signature of prekey (base64)
  one_time_prekeys TEXT NOT NULL,             -- JSON array of one-time prekeys (base64)
  created_at INTEGER NOT NULL,                -- Creation timestamp
  updated_at INTEGER NOT NULL,                -- Last update timestamp
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour recherche rapide par fingerprint
CREATE INDEX IF NOT EXISTS idx_e2ee_fingerprint ON e2ee_key_bundles(fingerprint);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,                    -- UUID
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,                     -- Ciphertext chiffré E2E
  sender_plaintext TEXT,                  -- Plaintext copy for the sender (see MESSAGE_WORKFLOW.md)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  
  -- Fonctionnalités avancées (futures)
  unlock_block_height INTEGER,            -- Time-Lock (hauteur bloc blockchain)
  is_burned INTEGER DEFAULT 0,            -- Burn After Reading (0 = false, 1 = true)
  burned_at INTEGER,                      -- Timestamp destruction
  scheduled_burn_at INTEGER,              -- Timestamp planifié de destruction
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour récupération rapide par conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- Index pour Time-Lock queries
CREATE INDEX IF NOT EXISTS idx_messages_unlock ON messages(unlock_block_height) WHERE unlock_block_height IS NOT NULL;

-- Index pour Burn After Reading
CREATE INDEX IF NOT EXISTS idx_messages_burned ON messages(is_burned, burned_at) WHERE is_burned = 1;
-- Index pour brûlures planifiées
CREATE INDEX IF NOT EXISTS idx_messages_scheduled_burn ON messages(scheduled_burn_at) WHERE scheduled_burn_at IS NOT NULL AND is_burned = 0;

-- ============================================================================
-- REFRESH_TOKENS TABLE (JWT Refresh Token Management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,               -- SHA-256 hash of refresh token
  expires_at INTEGER NOT NULL,            -- Timestamp d'expiration (7 jours)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  revoked INTEGER DEFAULT 0,              -- 0 = actif, 1 = révoqué
  revoked_at INTEGER,                     -- Timestamp révocation
  last_used_at INTEGER,                   -- Timestamp dernière utilisation
  user_agent TEXT,                        -- User agent du client
  ip_address TEXT,                        -- IP du client
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index pour recherche rapide par user_id
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Index pour recherche par token_hash
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Index pour nettoyage des tokens expirés
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked = 0;

-- ============================================================================
-- AUDIT_LOGS TABLE (Security Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT,                           -- User who performed action (nullable)
  action TEXT NOT NULL,                   -- Action type (INSERT, UPDATE, DELETE, LOGIN, etc.)
  table_name TEXT NOT NULL,               -- Table affected
  record_id TEXT,                         -- ID of affected record
  old_values TEXT,                        -- JSON of old values (for UPDATE/DELETE)
  new_values TEXT,                        -- JSON of new values (for INSERT/UPDATE)
  ip_address TEXT,                        -- Client IP address
  user_agent TEXT,                        -- Client user agent
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  severity TEXT DEFAULT 'INFO',           -- INFO, WARNING, CRITICAL
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, timestamp DESC) WHERE severity IN ('WARNING', 'CRITICAL');

-- ============================================================================
-- AUDIT TRIGGERS (Automatic logging for sensitive operations)
-- ============================================================================

-- Trigger: Log user deletions
CREATE TRIGGER IF NOT EXISTS audit_user_delete
AFTER DELETE ON users
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, timestamp, severity)
  VALUES (
    lower(hex(randomblob(16))),
    OLD.id,
    'DELETE',
    'users',
    OLD.id,
    json_object(
      'username', OLD.username,
      'security_tier', OLD.security_tier,
      'created_at', OLD.created_at
    ),
    strftime('%s', 'now') * 1000,
    'CRITICAL'
  );
END;

-- Trigger: Log refresh token revocations
CREATE TRIGGER IF NOT EXISTS audit_refresh_token_revoke
AFTER UPDATE OF revoked ON refresh_tokens
WHEN NEW.revoked = 1 AND OLD.revoked = 0
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, timestamp, severity)
  VALUES (
    lower(hex(randomblob(16))),
    NEW.user_id,
    'REVOKE_TOKEN',
    'refresh_tokens',
    NEW.id,
    json_object('revoked', OLD.revoked),
    json_object('revoked', NEW.revoked, 'revoked_at', NEW.revoked_at),
    strftime('%s', 'now') * 1000,
    'WARNING'
  );
END;

-- Trigger: Log message burns (burn after reading)
CREATE TRIGGER IF NOT EXISTS audit_message_burn
AFTER UPDATE OF is_burned ON messages
WHEN NEW.is_burned = 1 AND OLD.is_burned = 0
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, timestamp, severity)
  VALUES (
    lower(hex(randomblob(16))),
    NEW.sender_id,
    'BURN_MESSAGE',
    'messages',
    NEW.id,
    json_object('is_burned', OLD.is_burned),
    json_object('is_burned', NEW.is_burned, 'burned_at', NEW.burned_at),
    strftime('%s', 'now') * 1000,
    'INFO'
  );
END;

-- Trigger: Log conversation deletions
CREATE TRIGGER IF NOT EXISTS audit_conversation_delete
AFTER DELETE ON conversations
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (id, action, table_name, record_id, old_values, timestamp, severity)
  VALUES (
    lower(hex(randomblob(16))),
    'DELETE',
    'conversations',
    OLD.id,
    json_object(
      'created_at', OLD.created_at,
      'last_message_at', OLD.last_message_at
    ),
    strftime('%s', 'now') * 1000,
    'WARNING'
  );
END;

-- ============================================================================
-- METADATA TABLE (Version DB, migrations, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Insérer version initiale
INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1.2.0');
INSERT OR IGNORE INTO metadata (key, value) VALUES ('created_at', strftime('%s', 'now') * 1000);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Mettre à jour last_message_id dans conversations
CREATE TRIGGER IF NOT EXISTS update_conversation_last_message
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
  UPDATE conversations
  SET 
    last_message_id = NEW.id,
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
END;

-- Trigger: Empêcher modification des messages chiffrés (immutabilité)
CREATE TRIGGER IF NOT EXISTS prevent_message_body_update
BEFORE UPDATE OF body ON messages
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Message body is immutable');
END;

-- ============================================================================
-- ATTACHMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id, created_at DESC);

-- ============================================================================
-- VIEWS (Optional - Pour requêtes simplifiées)
-- ============================================================================

-- View: Conversations avec détails (pour API /conversations)
CREATE VIEW IF NOT EXISTS conversations_with_details AS
SELECT 
  c.id,
  c.created_at,
  c.last_message_at,
  m.id AS last_message_id,
  m.sender_id AS last_message_sender_id,
  m.body AS last_message_body,
  m.created_at AS last_message_created_at
FROM conversations c
LEFT JOIN messages m ON c.last_message_id = m.id;

-- View: Messages avec détails sender (pour debugging)
CREATE VIEW IF NOT EXISTS messages_with_sender AS
SELECT 
  m.*,
  u.username AS sender_username,
  u.security_tier AS sender_tier
FROM messages m
JOIN users u ON m.sender_id = u.id;

-- ============================================================================
-- SAMPLE DATA (Development only - À retirer en production)
-- ============================================================================

-- Exemple de données pour tests (commenté par défaut)
/*
INSERT INTO users (id, username, security_tier, mnemonic) VALUES
  ('test-user-1', 'alice', 'standard', '["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10", "word11", "word12"]'),
  ('test-user-2', 'bob', 'standard', '["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10", "word11", "word12"]');

INSERT INTO conversations (id) VALUES ('test-user-1:test-user-2');

INSERT INTO conversation_members (conversation_id, user_id) VALUES
  ('test-user-1:test-user-2', 'test-user-1'),
  ('test-user-1:test-user-2', 'test-user-2');
*/
