-- Fix corrupt message that causes atob errors
-- This message has invalid encryption format

-- Check the message first
SELECT id, sender_id, body, created_at, is_burned 
FROM messages 
WHERE id = 'bd0f9276-4de9-40ce-9a2f-9b3ceb1e4f3d';

-- Delete the corrupt message
DELETE FROM messages 
WHERE id = 'bd0f9276-4de9-40ce-9a2f-9b3ceb1e4f3d';

-- Verify deletion
SELECT COUNT(*) as remaining FROM messages 
WHERE id = 'bd0f9276-4de9-40ce-9a2f-9b3ceb1e4f3d';
-- Should return 0
