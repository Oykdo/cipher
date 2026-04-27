-- Migration 004 — Drop the audit_logs table entirely
-- Date     : 2026-04-27
-- Sprint   : privacy-l1
-- Contract : CIPHER_PRIVACY_GUARANTEES.md
--
-- The audit_logs table recorded every authentication event with the
-- corresponding user_id, action, IP address, and user-agent. Migration
-- 002 already stripped IP and user-agent. This migration drops the
-- whole table because the privacy contract forbids server-side tracking
-- of user activity:
--
--   "No analytics tracking, no third-party Sentry/Datadog, no telemetry.
--    No audit logs with persistent IP/UA beyond 30 days [TARGET]."
--
-- A persistent log of "who logged in when" is itself a metadata leak,
-- even without IP / UA fields. If abuse-fighting requires events, they
-- must live in a short-rotation log file (Pino with redact, see
-- index.ts), not in a queryable database table.
--
-- Application code that used to call db.createAuditLog / getAuditLogs /
-- getAuditStats has been refactored: logAuthAction (utils/auditLog.ts)
-- becomes a no-op, the admin endpoints /api/audit-logs and /api/audit-stats
-- are removed from routes/health.ts, and database.js no longer exposes
-- the corresponding methods.

BEGIN;

DROP TABLE IF EXISTS audit_logs CASCADE;

INSERT INTO metadata (key, value) VALUES ('schema_version', '2.2.0')
  ON CONFLICT (key) DO UPDATE SET value = '2.2.0', updated_at = NOW();

COMMIT;
