-- Add avatar_hash column to users table
-- This column stores the SHA-256 hash of the user's avatar .blend file for login

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_hash VARCHAR(64);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_avatar_hash ON users(avatar_hash) WHERE avatar_hash IS NOT NULL;

-- Log the migration
INSERT INTO metadata (key, value, updated_at) 
VALUES ('migration_avatar_hash', 'completed', NOW())
ON CONFLICT (key) DO UPDATE SET value = 'completed', updated_at = NOW();
