/**
 * GET /api/v2/vault/economy — authoritative resonance/entropy for the
 * caller's linked vault.
 *
 * The frontend cannot read the Eidolon API directly: that route is gated by
 * the Connect shared secret, which has no business being shipped inside a
 * renderer bundle. The bridge already holds the secret for the activity
 * reporter and the vault registry, so it proxies the read here — restricted
 * to the vault linked to the authenticated account, so this never becomes an
 * open lookup for anyone else's economy state.
 *
 * The response is the upstream payload, unchanged, so Cipher and the Eidolon
 * vault summary quote the same number with the same precision. See
 * services/eidolonVaultEconomy.ts for why the standalone Connect server is
 * not that number.
 */

import type { FastifyInstance } from 'fastify';

import { config } from '../config.js';
import { getDatabase } from '../db/database.js';
import {
  fetchVaultEconomy,
  isVaultEconomyConfigured,
  type EconomyFailure,
} from '../services/eidolonVaultEconomy.js';

// The upstream economy route refuses anything shorter than 16 chars, and real
// vault ids are 64 hex — reject the rest here rather than proxying a request
// that cannot succeed.
const VAULT_ID_REGEX = /^[a-f0-9]{16,64}$/;

export type VaultIdResolution =
  | { ok: true; vaultId: string }
  | { ok: false; code: 'invalid' | 'no_link' | 'not_linked' };

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/**
 * Decides which vault the caller may read.
 *
 * `requested` is optional: with no query parameter the account's own linked
 * vault is used. When given, it must be that same vault — a linked account is
 * not a licence to read every vault id someone can type.
 */
export const resolveRequestedVaultId = (
  requested: unknown,
  linkedIds: Array<string | null | undefined>,
): VaultIdResolution => {
  const linked = linkedIds.map(normalize).filter((id) => VAULT_ID_REGEX.test(id));
  if (linked.length === 0) {
    return { ok: false, code: 'no_link' };
  }

  const asked = normalize(requested);
  if (!asked) {
    return { ok: true, vaultId: linked[0] };
  }
  if (!VAULT_ID_REGEX.test(asked)) {
    return { ok: false, code: 'invalid' };
  }
  if (!linked.includes(asked)) {
    return { ok: false, code: 'not_linked' };
  }
  return { ok: true, vaultId: asked };
};

/**
 * A failed read is never reported as a vault sitting at its default values:
 * the frontend has to be able to tell "unknown" from "50".
 */
export const statusForFailure = (reason: EconomyFailure): number => {
  switch (reason) {
    case 'not_configured':
      return 503;
    case 'not_found':
      return 404;
    case 'unreachable':
      return 504;
    default:
      // 'unauthorized' included: a rejected secret is a bridge misconfiguration,
      // not something the authenticated caller did wrong.
      return 502;
  }
};

export async function vaultEconomyRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v2/vault/economy',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (!config.eidolonConnectEnabled || !isVaultEconomyConfigured()) {
        reply.code(503);
        return { error: 'eidolon_economy_unavailable' };
      }

      // Resolved per request, not at import time, so the pure helpers below
      // stay importable without opening a connection pool.
      const db = getDatabase();
      const userId = request.user.sub;
      const settings = await db.getUserSettings(userId);
      const settingsVaultId = settings?.eidolonBridge?.vaultId;

      // users.linked_vault_id is written alongside the settings JSON on link
      // (routes/auth.ts) and is what the activity reporter reads; accept
      // either so a partially-written link still resolves.
      let columnVaultId: string | null = null;
      try {
        const linkRow = await db.pool.query<{ linked_vault_id: string | null }>(
          'SELECT linked_vault_id FROM users WHERE id = $1',
          [userId],
        );
        columnVaultId = linkRow.rows[0]?.linked_vault_id ?? null;
      } catch (error) {
        request.log.warn({ err: error, userId }, 'linked_vault_id lookup failed');
      }

      const resolution = resolveRequestedVaultId(
        (request.query as { vaultId?: string }).vaultId,
        [settingsVaultId, columnVaultId],
      );

      if (!resolution.ok) {
        if (resolution.code === 'invalid') {
          reply.code(400);
          return { error: 'invalid vaultId' };
        }
        if (resolution.code === 'no_link') {
          reply.code(404);
          return { error: 'no vault linked to this account' };
        }
        reply.code(403);
        return { error: 'vaultId does not match authenticated user' };
      }

      const result = await fetchVaultEconomy(resolution.vaultId, request.log);
      if (!result.ok) {
        reply.code(statusForFailure(result.reason));
        return { error: 'vault economy unavailable', reason: result.reason };
      }

      return result.state;
    },
  );
}
