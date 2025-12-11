-- ============================================================================
-- DICEKEY PUBLIC KEYS TABLES
-- Migration: 001_add_dicekey_tables
-- Date: 2025-11-11
-- Description: Ajouter les tables pour stocker les clés publiques DiceKey
-- Compatible with: PostgreSQL
-- ============================================================================

-- ============================================================================
-- IDENTITY KEYS TABLE
-- Stocke les clés Identity (Ed25519) pour vérification d'identité
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,                -- Clé publique Identity (Ed25519, 32 bytes en base64)
  fingerprint TEXT NOT NULL,               -- Empreinte pour vérification rapide
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,          -- TRUE = active, FALSE = révoquée
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, public_key)            -- Un user peut avoir plusieurs clés (rotation)
);

CREATE INDEX IF NOT EXISTS idx_identity_keys_user ON identity_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_identity_keys_fingerprint ON identity_keys(fingerprint);

-- ============================================================================
-- SIGNATURE KEYS TABLE
-- Stocke les clés Signature (Ed25519) pour signatures de messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS signature_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,                -- Clé publique Signature (Ed25519, 32 bytes en base64)
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, public_key)
);

CREATE INDEX IF NOT EXISTS idx_signature_keys_user ON signature_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_signature_keys_fingerprint ON signature_keys(fingerprint);

-- ============================================================================
-- SIGNED PRE-KEYS TABLE
-- Stocke les Signed Pre-Keys (X25519 + signature Ed25519) pour X3DH
-- ============================================================================
CREATE TABLE IF NOT EXISTS signed_pre_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  key_id INTEGER NOT NULL,                 -- ID unique de la pré-clé (0, 1, 2...)
  public_key TEXT NOT NULL,                -- Clé publique X25519 (32 bytes en base64)
  signature TEXT NOT NULL,                 -- Signature Ed25519 de la clé (64 bytes en base64)
  timestamp BIGINT NOT NULL,               -- Timestamp de création de la signature (conservé en BIGINT pour intégrité)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, key_id)                -- Un user ne peut avoir qu'une Signed Pre-Key par key_id
);

CREATE INDEX IF NOT EXISTS idx_signed_pre_keys_user ON signed_pre_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_signed_pre_keys_key_id ON signed_pre_keys(key_id);

-- ============================================================================
-- ONE-TIME PRE-KEYS TABLE
-- Stocke les One-Time Pre-Keys (X25519) pour Perfect Forward Secrecy
-- ============================================================================
CREATE TABLE IF NOT EXISTS one_time_pre_keys (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  key_id INTEGER NOT NULL,                 -- ID unique (0-99 pour bundle initial)
  public_key TEXT NOT NULL,                -- Clé publique X25519 (32 bytes en base64)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,        -- NULL = non utilisée, timestamp si utilisée
  used_by VARCHAR(255),                    -- User ID qui a consommé cette clé
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user ON one_time_pre_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_unused ON one_time_pre_keys(user_id, used_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_used ON one_time_pre_keys(used_at) WHERE used_at IS NOT NULL;

-- ============================================================================
-- AUDIT TRIGGERS pour les clés
-- ============================================================================

-- Function: Log révocation de Identity Key
CREATE OR REPLACE FUNCTION audit_identity_key_revoke_func() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, timestamp, severity)
  VALUES (
    encode(gen_random_bytes(16), 'hex'),
    NEW.user_id,
    'REVOKE_IDENTITY_KEY',
    'identity_keys',
    NEW.id::text,
    json_build_object('is_active', OLD.is_active),
    json_build_object('is_active', NEW.is_active, 'revoked_at', NEW.revoked_at),
    NOW(),
    'WARNING'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_identity_key_revoke
AFTER UPDATE OF is_active ON identity_keys
FOR EACH ROW
WHEN (NEW.is_active = FALSE AND OLD.is_active = TRUE)
EXECUTE FUNCTION audit_identity_key_revoke_func();

-- Function: Log révocation de Signature Key
CREATE OR REPLACE FUNCTION audit_signature_key_revoke_func() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, timestamp, severity)
  VALUES (
    encode(gen_random_bytes(16), 'hex'),
    NEW.user_id,
    'REVOKE_SIGNATURE_KEY',
    'signature_keys',
    NEW.id::text,
    json_build_object('is_active', OLD.is_active),
    json_build_object('is_active', NEW.is_active, 'revoked_at', NEW.revoked_at),
    NOW(),
    'WARNING'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_signature_key_revoke
AFTER UPDATE OF is_active ON signature_keys
FOR EACH ROW
WHEN (NEW.is_active = FALSE AND OLD.is_active = TRUE)
EXECUTE FUNCTION audit_signature_key_revoke_func();

-- Function: Log utilisation de One-Time Pre-Key
CREATE OR REPLACE FUNCTION audit_one_time_pre_key_use_func() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, timestamp, severity)
  VALUES (
    encode(gen_random_bytes(16), 'hex'),
    NEW.user_id,
    'USE_ONE_TIME_PRE_KEY',
    'one_time_pre_keys',
    NEW.id::text,
    json_build_object('used_at', OLD.used_at),
    json_build_object('used_at', NEW.used_at, 'used_by', NEW.used_by),
    NOW(),
    'INFO'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_one_time_pre_key_use
AFTER UPDATE OF used_at ON one_time_pre_keys
FOR EACH ROW
WHEN (NEW.used_at IS NOT NULL AND OLD.used_at IS NULL)
EXECUTE FUNCTION audit_one_time_pre_key_use_func();

-- ============================================================================
-- METADATA UPDATE
-- ============================================================================
INSERT INTO metadata (key, value, updated_at) VALUES ('schema_version', '1.3.0', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO metadata (key, value, updated_at) VALUES ('migration_001_applied', EXTRACT(EPOCH FROM NOW())::text, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
