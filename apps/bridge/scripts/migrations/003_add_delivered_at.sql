-- Migration 003 — Add `delivered_at` to messages for the privacy-l1 purge worker
-- Date     : 2026-04-27
-- Sprint   : privacy-l1
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- Adds the timestamp the purge worker uses to drop delivered messages
-- after a 7-day post-pickup grace, while a separate 30-day max-pending
-- safety net covers messages that were never picked up.
--
-- Server purge rules (run hourly by purge-worker.ts):
--   DELETE FROM messages WHERE
--     (delivered_at IS NOT NULL AND delivered_at < NOW() - INTERVAL '7 days')
--     OR
--     (delivered_at IS NULL AND created_at < NOW() - INTERVAL '30 days');
--
-- Time-lock (drand) is enforced client-side, so the unlock time does not
-- constrain server retention — recipients must still pick the blob up
-- within 30 days, after which it is dropped regardless of unlock time.

BEGIN;

-- ============================================================================
-- MESSAGES — add delivered_at
-- ============================================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Index used by the purge worker for the nominal path (delivered > 7d).
-- Partial index keeps the index small (NULL rows live in the other one).
CREATE INDEX IF NOT EXISTS idx_messages_purge_delivered
  ON messages(delivered_at)
  WHERE delivered_at IS NOT NULL;

-- Index used by the purge worker for the safety net (pending > 30d).
CREATE INDEX IF NOT EXISTS idx_messages_purge_pending
  ON messages(created_at)
  WHERE delivered_at IS NULL;

COMMENT ON COLUMN messages.delivered_at IS
  'Set when all conversation recipients have fetched the message (privacy-l1). Worker purges T+7d after this value, or T+30d after created_at if NULL.';

-- ============================================================================
-- BUMP SCHEMA VERSION
-- ============================================================================
INSERT INTO metadata (key, value) VALUES ('schema_version', '2.1.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.1.0', updated_at = NOW();

COMMIT;
