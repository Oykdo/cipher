/**
 * Reads the authoritative economy state of a vault from the Eidolon API.
 *
 * Resonance and entropy live in three places, and only one of them is the
 * truth:
 *
 *   1. Eidolon's vault registry, served by the full API
 *      (src/api/server.py, GET /connect/vault/economy/<id>) and printed by
 *      the desktop vault summary. Written by the Cipher-activity processor
 *      and the yield tick, with 4-decimal precision.
 *   2. The standalone Connect server (deploy/connect-api), which keeps a
 *      parallel stub economy: resonance_base bumped +2 per activity ping and
 *      truncated to an int, no balance, no pioneer tier.
 *   3. users.last_known_resonance in Cipher's own database, written by
 *      cipherActivityReporter and read by nothing but that reporter.
 *
 * The frontend used to poll (2), so Cipher displayed 51 "Steady" while the
 * Eidolon vault summary showed 46.70 for the same vault — plus a zeroed
 * balance and a "standard" tier for a supreme vault, because the Connect
 * server only ever held an auto-created stub record for it. This module
 * targets (1) so both apps quote the same number.
 *
 * Configuration (shared with cipherActivityReporter / eidolonVaultRegistry):
 *   EIDOLON_CONNECT_URL             base URL of the Eidolon API
 *   EIDOLON_CONNECT_SESSION_SECRET  shared secret the read route requires
 *
 * The upstream route answers `require_connect_session_access`, which accepts
 * either a local caller or that secret — a bridge on Fly is never local, so
 * without a valid secret every read fails with 'unauthorized'.
 */

import type { FastifyBaseLogger } from 'fastify';

const EIDOLON_BASE_URL = (process.env.EIDOLON_CONNECT_URL || '').replace(/\/$/, '');
const EIDOLON_SECRET = process.env.EIDOLON_CONNECT_SESSION_SECRET || '';

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Wire shape of the upstream response, passed through to the frontend as-is
 * so the two ends keep quoting identical field names and precision.
 */
export type EidolonVaultEconomy = {
  vault_id: string;
  vault_number: number | null;
  vault_name: string | null;
  pioneer_tier: string;
  eidolon_balance: number;
  resonance_score: number;
  operational_entropy: number;
  holographic_depth_level: number;
  lifetime_eidolon_earned: number;
  lifetime_eidolon_spent: number;
  last_maintenance_at: string | null;
};

export type EconomyFailure =
  | 'not_configured'
  | 'unauthorized'
  | 'not_found'
  | 'unreachable'
  | 'bad_payload'
  | 'upstream_error';

export type VaultEconomyResult =
  | { ok: true; state: EidolonVaultEconomy }
  | { ok: false; reason: EconomyFailure; status?: number };

export const isVaultEconomyConfigured = () => Boolean(EIDOLON_BASE_URL);

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Normalises the upstream payload. Resonance and entropy are required: a
 * response without them is a contract change, not a vault at 0, and must not
 * be shown as one.
 */
export const parseVaultEconomy = (
  payload: unknown,
  vaultId: string,
): EidolonVaultEconomy | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  if (
    typeof raw.resonance_score !== 'number' ||
    typeof raw.operational_entropy !== 'number' ||
    !Number.isFinite(raw.resonance_score) ||
    !Number.isFinite(raw.operational_entropy)
  ) {
    return null;
  }

  return {
    vault_id: asString(raw.vault_id) ?? vaultId,
    vault_number: typeof raw.vault_number === 'number' ? raw.vault_number : null,
    vault_name: asString(raw.vault_name),
    pioneer_tier: asString(raw.pioneer_tier) ?? 'standard',
    eidolon_balance: asNumber(raw.eidolon_balance, 0),
    resonance_score: raw.resonance_score,
    operational_entropy: raw.operational_entropy,
    holographic_depth_level: asNumber(raw.holographic_depth_level, 0),
    lifetime_eidolon_earned: asNumber(raw.lifetime_eidolon_earned, 0),
    lifetime_eidolon_spent: asNumber(raw.lifetime_eidolon_spent, 0),
    last_maintenance_at: asString(raw.last_maintenance_at),
  };
};

/** Maps an upstream HTTP status onto the reason the caller reports. */
export const failureForStatus = (status: number): EconomyFailure => {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'upstream_error';
};

export const fetchVaultEconomy = async (
  vaultId: string,
  log?: FastifyBaseLogger,
): Promise<VaultEconomyResult> => {
  if (!EIDOLON_BASE_URL) {
    return { ok: false, reason: 'not_configured' };
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (EIDOLON_SECRET) {
    headers['X-Eidolon-Connect-Secret'] = EIDOLON_SECRET;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${EIDOLON_BASE_URL}/connect/vault/economy/${encodeURIComponent(vaultId)}`,
      { method: 'GET', headers, signal: controller.signal },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const reason = failureForStatus(response.status);
      log?.warn(
        { vaultId: vaultId.slice(0, 12), status: response.status, reason, detail: detail.slice(0, 200) },
        'Eidolon vault economy read rejected',
      );
      return { ok: false, reason, status: response.status };
    }

    const state = parseVaultEconomy(await response.json(), vaultId);
    if (!state) {
      log?.warn({ vaultId: vaultId.slice(0, 12) }, 'Eidolon vault economy payload unusable');
      return { ok: false, reason: 'bad_payload', status: response.status };
    }

    return { ok: true, state };
  } catch (error) {
    log?.warn({ err: error, vaultId: vaultId.slice(0, 12) }, 'Eidolon vault economy unreachable');
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
};
