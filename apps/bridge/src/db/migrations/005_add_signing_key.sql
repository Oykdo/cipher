-- Migration: Add Ed25519 signing key to E2EE key bundles
-- This enables proper Ed25519 signatures for Signed Pre-Keys (SPK)
-- as per Signal Protocol specification

-- Add signing_key column (Ed25519 public key, base64 encoded)
ALTER TABLE e2ee_key_bundles 
ADD COLUMN IF NOT EXISTS signing_key TEXT;

-- Note: signing_key can be NULL for existing bundles (backward compatibility)
-- New bundles should always include signing_key

COMMENT ON COLUMN e2ee_key_bundles.signing_key IS 'Ed25519 public signing key (base64) for SPK signature verification';
