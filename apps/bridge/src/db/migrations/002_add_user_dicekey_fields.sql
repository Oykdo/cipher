-- Migration: 002_add_user_dicekey_fields
-- Date: 2025-12-09
-- Description: Add missing columns for DiceKey and Avatar features to users table
-- These columns exist in SQLite schema but were missing in PostgreSQL schema

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS dicekey_checksums TEXT;

INSERT INTO metadata (key, value, updated_at) VALUES ('migration_002_applied', EXTRACT(EPOCH FROM NOW())::text, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
