-- Migration 012 — One account per Eidolon vault (users.linked_vault_id UNIQUE).
-- Date     : 2026-09-12
--
-- Decision D1 (cipher-mobile/docs/HANDOVER_PSNX_PARITE_DESKTOP.md §2): an
-- Eidolon vault is an authentication factor attached to an EXISTING Cipher
-- account. POST /api/v2/auth/vault-link writes users.linked_vault_id and the
-- vault login routes (eidolon-bridge/session, vault-token/redeem) resolve the
-- account through that column first, so a vault must never point at two
-- accounts. routes/auth.ts checks for a conflict before writing; this partial
-- unique index is the backstop against two concurrent link requests.
--
-- 010 created the column (VARCHAR(255)) with a plain partial index; the
-- guarded ADD COLUMN keeps this file self-contained for a database provisioned
-- from the base schema alone. If two rows already share a linked_vault_id
-- (only possible on databases linked before the vault-link route existed),
-- CREATE UNIQUE INDEX fails and nothing is changed: resolve the duplicate by
-- hand, then re-run.
--
-- Privacy (CIPHER_PRIVACY_GUARANTEES.md): a vault id is a public linkage
-- identifier, not a secret. No PII, no key material.

ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_vault_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linked_vault_id
  ON users(linked_vault_id) WHERE linked_vault_id IS NOT NULL;

COMMENT ON COLUMN users.linked_vault_id IS
  'Eidolon vault id (64 hex) used as an auth factor for this account. Unique: one account per vault.';

INSERT INTO metadata (key, value) VALUES ('schema_version', '2.5.4')
  ON CONFLICT (key) DO UPDATE SET value = '2.5.4', updated_at = NOW();
