-- Migration 006 — Add `public_key`, `sign_public_key`, `updated_at` to users
-- Date     : 2026-04-29
-- Sprint   : v1.1.1 hotfix
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- The bridge code reads these columns as the source-of-truth for a user's
-- public X3DH / signature keys (database.js:getMembersWithKeys uses
-- `COALESCE(u.public_key, ekb.identity_key)`), and `PUT /api/v2/users/me/public-keys`
-- writes them. They were silently absent from the schema bootstrap, so
-- every signup-time key upload from a fresh client crashed the route
-- with PostgreSQL `column "public_key" of relation "users" does not exist`,
-- the route caught it and returned 500 "Failed to upload public keys",
-- and the user was left without a discoverable public key — meaning no
-- peer could ever start an E2E conversation with them.
--
-- All three columns are public-keyed material or non-PII timestamps —
-- nothing in this migration introduces server-side secrets. Privacy
-- contract clean.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_key      TEXT,
  ADD COLUMN IF NOT EXISTS sign_public_key TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Used by peer-discovery / membership lookups; cheap partial index since
-- not every user has finished key publish (e.g. legacy accounts pre-1.1.1).
CREATE INDEX IF NOT EXISTS idx_users_public_key
  ON users(public_key)
  WHERE public_key IS NOT NULL;

COMMENT ON COLUMN users.public_key IS
  'X25519 identity key (base64url). Source-of-truth, populated by PUT /api/v2/users/me/public-keys.';
COMMENT ON COLUMN users.sign_public_key IS
  'Ed25519 signing key (base64url). Used to verify call/handshake signatures.';
COMMENT ON COLUMN users.updated_at IS
  'Last mutation timestamp (key publish, settings update, etc.). No PII.';

INSERT INTO metadata (key, value) VALUES ('schema_version', '2.4.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.4.0', updated_at = NOW();

COMMIT;
