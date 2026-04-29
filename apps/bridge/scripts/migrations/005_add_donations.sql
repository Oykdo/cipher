-- Migration 005 — Add `donations` table for Stripe contribution tracking
-- Date     : 2026-04-29
-- Sprint   : v1.1.1
-- Contract : CIPHER_PRIVACY_GUARANTEES.md (root)
--
-- Donations are *business records* (refunds, accounting, compliance),
-- not user-activity tracking. They contain only what is strictly
-- needed to operate Stripe payments end-to-end:
--
--   - stripe_session_id         the idempotency key (Stripe-issued)
--   - stripe_payment_intent_id  required to issue refunds
--   - amount_cents / currency   what the donor paid
--   - status                    pending | succeeded | failed | refunded
--   - customer_email            stored only because Stripe needs it
--                               for receipt and refund flows; never
--                               displayed in the UI, never linked to a
--                               Cipher user account
--   - metadata jsonb            raw Stripe metadata (`source`, etc.)
--                               for traceability of business questions
--
-- DELIBERATELY ABSENT (privacy contract enforcement):
--   - user_id / username       donations are anonymous w.r.t. Cipher accounts
--   - ip / user-agent          no surveillance metadata
--   - device fingerprints      idem
--
-- The corresponding webhook handler in apps/bridge/src/routes/stripe.ts
-- upserts on stripe_session_id so that retries from Stripe (which are
-- routine and expected) never create duplicates.

BEGIN;

-- ============================================================================
-- DONATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS donations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id        TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_cents             BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency                 CHAR(3) NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  customer_email           TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lookup by Stripe identifiers (used by the webhook upsert + refund flow).
CREATE INDEX IF NOT EXISTS idx_donations_session
  ON donations(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_donations_payment_intent
  ON donations(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Common ops queries: "succeeded donations in last N days", "pending stuck > 1h", etc.
CREATE INDEX IF NOT EXISTS idx_donations_status_created
  ON donations(status, created_at DESC);

COMMENT ON TABLE donations IS
  'Stripe contribution records. Business-record table, NOT linked to Cipher user accounts. See migration header for privacy rationale.';

COMMENT ON COLUMN donations.customer_email IS
  'Stripe-issued receipt email. Stored only for refund/receipt flows; never exposed in the UI.';

-- ============================================================================
-- BUMP SCHEMA VERSION
-- ============================================================================
INSERT INTO metadata (key, value) VALUES ('schema_version', '2.3.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.3.0', updated_at = NOW();

COMMIT;
