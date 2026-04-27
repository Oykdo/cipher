-- Migration 002 — Remove plaintext secrets from server-side persistence
-- Date     : 2026-04-27
-- Sprint   : privacy-l1
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- DESTRUCTIVE AND IRREVERSIBLE.
--
-- The columns dropped here contain secrets and PII that should never have
-- been stored server-side. The Neon production database is wiped before
-- this migration is applied (operators run `clearAllData()` first). There
-- is no rollback path — restoring these columns would re-introduce the
-- exact privacy violations they are designed to fix.
--
-- Audit context : 2026-04-26 audit found that the bridge stored:
--   - users.mnemonic           : the BIP-39 phrase (entire identity root)
--   - users.master_key_hex     : DiceKey master key
--   - users.dicekey_checksums  : DiceKey checksums
--   - messages.sender_plaintext: clear copy of every sent message
--   - refresh_tokens.{ip_address,user_agent}: PII per session
--   - audit_logs.{ip_address,user_agent}    : PII per auth event
--   - one_time_pre_keys.used_by             : "who initiated session with whom"
--   - conversation_requests.message         : free-text intro in clear
--
-- Replacement strategies:
--   - mnemonic / master_key      → live in the device-local KeyVault only.
--                                   Recovery uses the user typing their
--                                   mnemonic on the new device.
--   - sender_plaintext           → apps/frontend/src/lib/e2ee/
--                                   selfEncryptingMessage.ts — sender
--                                   writes a parallel ciphertext addressed
--                                   to themselves.
--   - PII columns                → no replacement; the server does not need
--                                   them to function.
--   - one_time_pre_keys.used_by  → used_at (already present) is sufficient.
--   - conversation_requests.msg  → drop for L1; revisit V2 with E2E encryption
--                                   if user demand emerges.

BEGIN;

-- ============================================================================
-- USERS — drop secrets that must live only on the user's device
-- ============================================================================
ALTER TABLE users DROP COLUMN IF EXISTS mnemonic;
ALTER TABLE users DROP COLUMN IF EXISTS master_key_hex;
ALTER TABLE users DROP COLUMN IF EXISTS dicekey_checksums;

-- ============================================================================
-- MESSAGES — drop the plaintext copy
-- ============================================================================
ALTER TABLE messages DROP COLUMN IF EXISTS sender_plaintext;

-- ============================================================================
-- REFRESH_TOKENS — drop PII
-- ============================================================================
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS ip_address;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS user_agent;

-- ============================================================================
-- AUDIT_LOGS — strip PII columns
-- ============================================================================
-- L1-T5 will decide whether to keep this table at all. For now, strip the
-- PII columns so the table cannot accumulate IPs/UAs even if it survives.
ALTER TABLE audit_logs DROP COLUMN IF EXISTS ip_address;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_agent;

-- ============================================================================
-- ONE_TIME_PRE_KEYS — drop usage metadata
-- ============================================================================
ALTER TABLE one_time_pre_keys DROP COLUMN IF EXISTS used_by;

-- ============================================================================
-- CONVERSATION_REQUESTS — drop plaintext intro
-- ============================================================================
ALTER TABLE conversation_requests DROP COLUMN IF EXISTS message;

-- ============================================================================
-- BUMP SCHEMA VERSION
-- ============================================================================
INSERT INTO metadata (key, value) VALUES ('schema_version', '2.0.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.0.0', updated_at = NOW();

COMMIT;
