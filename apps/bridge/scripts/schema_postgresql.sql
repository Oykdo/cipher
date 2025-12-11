-- Dead Drop Messenger - Database Schema (PostgreSQL)
-- Version: 1.2.0
-- Adapted from SQLite schema

-- Enable UUID extension
-- Drop existing tables to ensure clean state
DROP TABLE IF EXISTS one_time_pre_keys CASCADE;
DROP TABLE IF EXISTS signed_pre_keys CASCADE;
DROP TABLE IF EXISTS signature_keys CASCADE;
DROP TABLE IF EXISTS identity_keys CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
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
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,            -- ID (Legacy format)
  username VARCHAR(255) UNIQUE NOT NULL,  -- Nom d'utilisateur (unique, lowercase)
  security_tier VARCHAR(50) NOT NULL,     -- 'standard' | 'dice-key'
  mnemonic JSONB NOT NULL,                -- JSON array de mots mnémoniques
  master_key_hex TEXT,                    -- Clé maître hex (Dice-Key seulement)
  avatar_hash VARCHAR(255),               -- SHA-256 hash of the generated avatar .blend file
  dicekey_checksums TEXT,                 -- Encrypted JSON array of 30 hex checksums (DiceKey only)
  discoverable BOOLEAN DEFAULT TRUE,      -- Visible dans la recherche
  srp_salt TEXT,                          -- SRP Salt
  srp_verifier TEXT,                      -- SRP Verifier
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_discoverable ON users(discoverable, username);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,            -- Format: "userId1:userId2" (sorted) - Keeping VARCHAR to match current logic
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_id VARCHAR(255),           -- ID du dernier message (FK vers messages)
  last_message_at TIMESTAMP WITH TIME ZONE -- Timestamp dernier message (pour tri)
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

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
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,            -- ID (Legacy format)
  conversation_id VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,                     -- Ciphertext chiffré E2E
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
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  user_agent TEXT,
  ip_address VARCHAR(45),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked = FALSE;

-- ============================================================================
-- AUDIT_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id TEXT,                         -- Peut être UUID ou VARCHAR (conversation_id)
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  severity VARCHAR(20) DEFAULT 'INFO',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, timestamp DESC) WHERE severity IN ('WARNING', 'CRITICAL');

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

CREATE TABLE IF NOT EXISTS one_time_pre_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  key_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,
  used_by VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, key_id)
);
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user ON one_time_pre_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_unused ON one_time_pre_keys(user_id, used_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_used ON one_time_pre_keys(used_at) WHERE used_at IS NOT NULL;

-- ============================================================================
-- CONVERSATION_REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_requests (
  id VARCHAR(255) PRIMARY KEY,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  message TEXT,
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

INSERT INTO metadata (key, value) VALUES ('schema_version', '1.2.0') ON CONFLICT DO NOTHING;
