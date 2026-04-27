/**
 * Audit-log compatibility shim (privacy-l1).
 *
 * Pre-l1, this module wrote to the `audit_logs` table. That table was
 * dropped in migration 004 — see CIPHER_PRIVACY_GUARANTEES.md for the
 * rationale (a queryable persistent log of authentication events is a
 * metadata leak even with PII columns stripped).
 *
 * `logAuthAction` is kept as a thin shim so the dozens of existing
 * callers in routes/auth.ts and routes/index.ts don't need to change.
 * It now records into the in-memory `security-events` ring buffer
 * (bounded, restart-wiped, PII-free). Same call sites, no DB write,
 * no IP / user-agent stored.
 */

import type { FastifyRequest } from 'fastify';
import { recordSecurityEvent, type Severity } from '../services/security-events.js';

export async function logAuthAction(
  userId: string | null,
  action: string,
  _request: FastifyRequest,
  severity: Severity = 'INFO'
): Promise<void> {
  // The `_request` parameter is intentionally unused: it used to feed
  // ip_address and user_agent into the DB row, both of which are now
  // forbidden by the privacy contract. Keeping the parameter name
  // and call signature avoids touching every caller.
  recordSecurityEvent(action, userId, severity);
}
