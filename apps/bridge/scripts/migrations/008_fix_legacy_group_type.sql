-- Migration 008 — Fix legacy conversations rows where `type` was left at
-- the DEFAULT 'direct' even though the row is clearly a group.
-- Date     : 2026-05-01
-- Sprint   : v1.2.x patch
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- Symptom that motivated this migration: a conversation created via the
-- group flow appeared under the "1:1 CONVERSATIONS" sidebar header with
-- the title "Untitled group" / "Groupe sans nom". The frontend filter
-- (`isGroupConversation`) bucketed it into directs because `type` was
-- not 'group', while the title resolver fell through to the group
-- "Untitled group" branch because `type` was not 'direct' either —
-- which only reproduces when the row's `type` was NULL/empty BEFORE
-- migration 007 set it to 'direct' by default, and a subsequent legacy
-- import path (e.g. restoreUserData) failed to overwrite it. We now
-- promote any row with a group-only signal back to 'group'.
--
-- Group-only signals (any one is sufficient):
--   - created_by IS NOT NULL                — only groups have an owner
--   - encrypted_title IS NOT NULL           — only groups carry an opaque title
--   - >2 distinct members in conversation_members
--
-- Idempotent: re-running this script is a no-op once every legacy row
-- has been corrected.

BEGIN;

-- 1. Owner-bearing rows are unambiguously groups.
UPDATE conversations
   SET type = 'group'
 WHERE type <> 'group'
   AND created_by IS NOT NULL;

-- 2. Title-bearing rows are unambiguously groups.
UPDATE conversations
   SET type = 'group'
 WHERE type <> 'group'
   AND encrypted_title IS NOT NULL;

-- 3. Multi-member rows (>2) are groups by the 1.2.0 product definition.
--    Direct conversations are constrained to exactly 2 members at the
--    application layer; any row with 3+ members can only be a group.
UPDATE conversations c
   SET type = 'group'
 WHERE c.type <> 'group'
   AND (
     SELECT COUNT(*) FROM conversation_members cm
      WHERE cm.conversation_id = c.id
   ) > 2;

-- 4. Bump schema_version so /admin tools can detect a corrected DB.
INSERT INTO metadata (key, value) VALUES ('schema_version', '2.5.1')
  ON CONFLICT (key) DO UPDATE SET value = '2.5.1', updated_at = NOW();

COMMIT;
