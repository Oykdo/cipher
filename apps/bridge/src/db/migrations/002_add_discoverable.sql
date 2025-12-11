-- Migration 002: Add discoverable column to users table
-- Date: 2025-11-12
-- Description: Allow users to opt-in/out of public search
-- Compatible with: PostgreSQL

-- Check if column exists and is INTEGER, convert to BOOLEAN
DO $$ 
BEGIN
    -- If column doesn't exist, add it as BOOLEAN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='discoverable') THEN
        ALTER TABLE users ADD COLUMN discoverable BOOLEAN DEFAULT TRUE;
    ELSE
        -- If column exists as INTEGER, convert to BOOLEAN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='discoverable' 
                   AND data_type='integer') THEN
            ALTER TABLE users ALTER COLUMN discoverable TYPE BOOLEAN 
            USING CASE WHEN discoverable = 1 THEN TRUE ELSE FALSE END;
        END IF;
    END IF;
END $$;

-- Create index for faster search queries
CREATE INDEX IF NOT EXISTS idx_users_discoverable ON users(discoverable, username);
