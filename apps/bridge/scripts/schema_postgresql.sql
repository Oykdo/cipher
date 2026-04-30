-- Cipher - Database Schema (PostgreSQL)
-- Version: 2.5.0
--
-- Conforms to CIPHER_PRIVACY_GUARANTEES.md (root). Any column added here
-- must be justified against the contract: secrets and PII have no place
-- server-side. See migration 002_remove_plaintext_secrets.sql for the
-- columns intentionally removed in v2.0.0.

-- Enable UUID extension
-- Drop existing tables to ensure clean state
DROP TABLE IF EXISTS one_time_pre_keys CASCADE;
DROP TABLE IF EXISTS signed_pre_keys CASCADE;
DROP TABLE IF EXISTS signature_keys CASCADE;
DROP TABLE IF EXISTS identity_keys CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS message_deliveries CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversation_members CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS metadata CASCADE;

-- Enable UUID extension (optional now)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Identity directory — public keys + ZK auth verifier only.
-- The mnemonic, master key, and DiceKey checksums live ONLY on the user's
-- device. They were dropped in migration 002 (see CIPHER_PRIVACY_GUARANTEES.md).
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,            -- Internal user ID
  username VARCHAR(255) UNIQUE NOT NULL,  -- Display handle (unique, lowercase)
  security_tier VARCHAR(50) NOT NULL,     -- 'standard' | 'dice-key'
  avatar_hash VARCHAR(255),               -- SHA-256 of public avatar (served at /avatars/)
  discoverable BOOLEAN DEFAULT TRUE,      -- User opt-in to appear in search
  srp_salt TEXT,                          -- SRP Salt (challenge param, not a secret)
  srp_verifier TEXT,                      -- SRP Verifier (does not reveal password)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_discoverable ON users(discoverable, username);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
-- Direct (1:1) and group (2-10 members) conversations share this table.
-- The `type` column discriminates; `created_by` is the group owner (NULL
-- for direct), and `encrypted_title` is opaque ciphertext (e2ee-v2 keys-
-- map) for the optional group title. The 2-10 member-count constraint is
-- enforced applicatively in routes/groups.ts, not via SQL trigger.
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,            -- UUID v4 (randomUUID()) for both direct and group
  type VARCHAR(16) NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  created_by VARCHAR(255),                -- Group owner; NULL for direct conversations
  encrypted_title TEXT,                   -- Group title (e2ee-v2 envelope); NULL for direct
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_id VARCHAR(255),           -- ID du dernier message (FK vers messages)
  last_message_at TIMESTAMP WITH TIME ZONE, -- Timestamp dernier message (pour tri)
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);

-- ============================================================================
-- CONVERSATION_MEMBERS TABLE (Junction table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
-- Message envelopes — opaque ciphertext only. No plaintext, ever.
-- The sender uses selfEncryptingMessage (frontend) to keep their own
-- readable copy via a parallel ciphertext addressed to themselves; the
-- server cannot distinguish it from a regular message.
--
-- Retention policy (enforced by purge-worker.ts):
--   * delivered_at IS NOT NULL AND > 7 days old  → DELETE (post-pickup grace)
--   * delivered_at IS NULL AND created_at > 30 days old → DELETE (max pending)
-- Time-lock (drand) does NOT extend retention — locks are enforced
-- client-side, so the recipient must pick the blob up within 30 days
-- regardless of the unlock time.
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,                     -- Ciphertext E2E (opaque to server)
  delivered_at TIMESTAMP WITH TIME ZONE,  -- Set when all recipients fetched it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Fonctionnalités avancées
  unlock_block_height BIGINT,             -- Time-Lock (hauteur bloc blockchain)
  is_burned BOOLEAN DEFAULT FALSE,        -- Burn After Reading
  burned_at TIMESTAMP WITH TIME ZONE,     -- Timestamp destruction
  scheduled_burn_at TIMESTAMP WITH TIME ZONE, -- Timestamp planifié de destruction
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unlock ON messages(unlock_block_height) WHERE unlock_block_height IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_burned ON messages(is_burned, burned_at) WHERE is_burned = TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_scheduled_burn ON messages(scheduled_burn_at) WHERE scheduled_burn_at IS NOT NULL AND is_burned = FALSE;
-- Purge worker indexes (privacy-l1) — partial indexes keep them small.
CREATE INDEX IF NOT EXISTS idx_messages_purge_delivered ON messages(delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_purge_pending ON messages(created_at) WHERE delivered_at IS NULL;

-- ============================================================================
-- MESSAGE_DELIVERIES TABLE (per-recipient ACK for groups)
-- ============================================================================
-- Direct (1:1) conversations keep using messages.delivered_at unchanged
-- (a single timestamp is enough when there's exactly one recipient). For
-- group conversations, messages.delivered_at can no longer represent
-- "every recipient fetched it" without per-recipient state, so we store
-- one row per (message, recipient) here. markMessagesDeliveredFor()
-- promotes messages.delivered_at to NOW once every non-sender member
-- has a delivered_at IS NOT NULL row. Read receipts (read_at) are
-- modelled but not exposed in 1.2.0.
CREATE TABLE IF NOT EXISTS message_deliveries (
  message_id   VARCHAR(255) NOT NULL,
  user_id      VARCHAR(255) NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at      TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_deliveries_user_pending
  ON message_deliveries(user_id, message_id)
  WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_message_deliveries_message
  ON message_deliveries(message_id);

-- ============================================================================
-- ATTACHMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(255) PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL,
  uploader_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id, created_at DESC);

-- ============================================================================
-- REFRESH_TOKENS TABLE
-- ============================================================================
-- Refresh tokens — session identity only. No PII (no IP, no user-agent).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked = FALSE;

-- ============================================================================
-- AUDIT_LOGS TABLE
-- ============================================================================
-- audit_logs table dropped in migration 004 (privacy-l1). A persistent
-- log of authentication events is itself a metadata leak, even with PII
-- columns stripped. Short-rotation Pino logs (with redact) cover
-- abuse-fighting needs without a queryable DB table — see index.ts.

-- ============================================================================
-- DICEKEY TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, public_key)
);
CREATE INDEX IF NOT EXISTS idx_identity_keys_user ON identity_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_identity_keys_fingerprint ON identity_keys(fingerprint);

CREATE TABLE IF NOT EXISTS signature_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, public_key)
);
CREATE INDEX IF NOT EXISTS idx_signature_keys_user ON signature_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_signature_keys_fingerprint ON signature_keys(fingerprint);

CREATE TABLE IF NOT EXISTS signed_pre_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  key_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, key_id)
);
CREATE INDEX IF NOT EXISTS idx_signed_pre_keys_user ON signed_pre_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_signed_pre_keys_key_id ON signed_pre_keys(key_id);

-- One-time pre-keys — used_by removed (leaked who-initiated-with-whom graph).
-- used_at suffices to mark the prekey as consumed.
CREATE TABLE IF NOT EXISTS one_time_pre_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  key_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, key_id)
);
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user ON one_time_pre_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_unused ON one_time_pre_keys(user_id, used_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_used ON one_time_pre_keys(used_at) WHERE used_at IS NOT NULL;

-- ============================================================================
-- CONVERSATION_REQUESTS TABLE
-- ============================================================================
-- Conversation requests — no plaintext intro message. Recipient sees only
-- "X wants to talk to you" — accept/refuse. E2E intro deferred to V2.
CREATE TABLE IF NOT EXISTS conversation_requests (
  id VARCHAR(255) PRIMARY KEY,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  conversation_id VARCHAR(255),
  
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_to_user 
  ON conversation_requests(to_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_from_user 
  ON conversation_requests(from_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_requests_status 
  ON conversation_requests(status, created_at DESC);

-- ============================================================================
-- METADATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS metadata (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO metadata (key, value) VALUES ('schema_version', '2.5.0') ON CONFLICT DO NOTHING;
