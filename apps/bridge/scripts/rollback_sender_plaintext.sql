-- Rollback script: remove sender_plaintext column
-- WARNING: This will permanently delete any stored sender plaintext.

ALTER TABLE messages
  DROP COLUMN IF EXISTS sender_plaintext;
