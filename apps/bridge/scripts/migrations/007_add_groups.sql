-- Migration 007 — Group conversations (2-10 members, owner-only governance)
-- Date     : 2026-04-30
-- Sprint   : v1.2.0
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- Adds the schema needed for group conversations on top of the existing
-- 1:1-only model. The conversation_members junction table already supports
-- N members, but the domain entity, the routes and the frontend types all
-- enforced exactly 2 participants. This migration:
--
--   1. Adds `type`, `created_by`, `encrypted_title` columns to
--      conversations so existing rows are tagged 'direct' (DEFAULT) and
--      groups carry their owner + an opaque E2EE-encrypted title.
--   2. Adds the message_deliveries junction table for per-recipient
--      delivery tracking. Direct conversations continue to use the
--      coarse-grained messages.delivered_at column unchanged — no
--      backfill, no behavior change for existing 1:1 chats. Groups use
--      message_deliveries because messages.delivered_at can no longer
--      represent "all recipients fetched it" without per-recipient state.
--
-- Privacy contract: encrypted_title is opaque ciphertext (e2ee-v2 keys-map);
-- created_by references users(id) which is already part of the schema.
-- No new PII or plaintext content surfaces server-side.
--
-- Idempotent: every DDL uses IF NOT EXISTS / ON CONFLICT.
-- The `2 ≤ count ≤ 10` member-count constraint is enforced at the
-- application layer (routes/groups.ts) — implementing it as a SQL trigger
-- on conversation_members would be brittle and slow.

BEGIN;

-- ============================================================================
-- 1. Augmenter conversations
-- ============================================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS type            VARCHAR(16)  NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS created_by      VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS encrypted_title TEXT         NULL;

-- FK ajoutée séparément (created_by NULL pour les conversations directes
-- existantes — pas d'owner pour le legacy 1:1).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_created_by_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_type_chk'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_type_chk
      CHECK (type IN ('direct', 'group'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);

-- ============================================================================
-- 2. message_deliveries (per-recipient ACK pour les groupes uniquement)
-- ============================================================================
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
-- 3. Backfill défensif
-- ============================================================================
-- Le DEFAULT 'direct' a déjà fait le travail à l'ALTER TABLE, mais on
-- s'assure qu'aucune ligne n'a un type NULL (impossible avec NOT NULL,
-- défensif au cas où la colonne aurait été ajoutée manuellement avant).
UPDATE conversations SET type = 'direct' WHERE type IS NULL;

-- ============================================================================
-- 4. Commentaires
-- ============================================================================
COMMENT ON COLUMN conversations.type IS
  'Conversation kind: direct (1:1, legacy default) or group (2-10 members).';
COMMENT ON COLUMN conversations.created_by IS
  'Group owner (the user who created the conversation). NULL for direct conversations and for legacy groups predating this column.';
COMMENT ON COLUMN conversations.encrypted_title IS
  'Group title encrypted client-side via the e2ee-v2 keys-map (opaque to server). NULL for direct conversations.';
COMMENT ON TABLE message_deliveries IS
  'Per-recipient delivery / read tracking for group conversations. Direct conversations keep using messages.delivered_at unchanged.';
COMMENT ON COLUMN message_deliveries.delivered_at IS
  'Timestamp at which the recipient fetched the message envelope. Used by markMessagesDeliveredFor() to promote messages.delivered_at when ALL non-sender members have fetched.';
COMMENT ON COLUMN message_deliveries.read_at IS
  'Reserved for future read-receipt UX (1.3+). Not exposed in 1.2.0.';

-- ============================================================================
-- 5. Bump schema_version
-- ============================================================================
INSERT INTO metadata (key, value) VALUES ('schema_version', '2.5.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.5.0', updated_at = NOW();

COMMIT;
