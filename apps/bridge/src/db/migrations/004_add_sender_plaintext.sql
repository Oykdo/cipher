-- Add sender_plaintext to messages
-- Allows the sender to re-read their own messages after reconnecting (see MESSAGE_WORKFLOW.md)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_plaintext TEXT;
