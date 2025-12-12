-- Migration: Add public_key and sign_public_key columns to users table
-- For e2ee-v2 (Self-Encrypting Message) support
-- Date: 2025-12-12

-- Add columns for Curve25519 and Ed25519 public keys
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS public_key TEXT,
ADD COLUMN IF NOT EXISTS sign_public_key TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_public_key 
ON users(public_key) 
WHERE public_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_sign_public_key 
ON users(sign_public_key) 
WHERE sign_public_key IS NOT NULL;

-- Add updated_at column if it doesn't exist (for tracking key updates)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;

CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON users 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN users.public_key IS 'Base64 encoded Curve25519 public key for encryption (e2ee-v2)';
COMMENT ON COLUMN users.sign_public_key IS 'Base64 encoded Ed25519 public key for signatures (e2ee-v2)';
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last user update';
