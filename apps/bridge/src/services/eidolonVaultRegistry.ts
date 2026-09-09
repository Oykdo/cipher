/**
 * Registers a vault with the hosted Eidolon registry.
 *
 * A vault can be born in several places — the genesis ceremony spawned by
 * routes/genesis.ts, the desktop Eidolon app, or an existing vault linked
 * through the vault-bridge login. Each of those writes the registry of the
 * machine that ran it, while the hosted economy only reads the registry of
 * the Eidolon server: the activity webhook ignores unknown vaults and the
 * hourly tick exits on "No vaults found in registry".
 *
 * Calling this on every link is what makes the two ends meet, whichever way
 * the vault was created.
 *
 * Configuration (shared with cipherActivityReporter):
 *   EIDOLON_CONNECT_URL             base URL of the Eidolon API
 *   CIPHER_WEBHOOK_SECRET           HMAC secret, identical on both sides
 *   EIDOLON_CONNECT_SESSION_SECRET  fallback shared-secret header
 *
 * Without a configured URL the call is a no-op: linking a vault must never
 * fail because the economy server is unreachable.
 */

import { createHmac } from 'crypto';

import type { FastifyBaseLogger } from 'fastify';

const EIDOLON_BASE_URL = process.env.EIDOLON_CONNECT_URL || '';
const EIDOLON_SECRET = process.env.EIDOLON_CONNECT_SESSION_SECRET || '';
const CIPHER_WEBHOOK_SECRET =
  process.env.CIPHER_WEBHOOK_SECRET || process.env.EIDOLON_CONNECT_SESSION_SECRET || '';

const REQUEST_TIMEOUT_MS = 5000;

export type VaultRegistration = {
  vaultId: string;
  vaultName?: string | null;
  vaultNumber?: number | null;
  createdAt?: string | null;
  source?: string;
};

export type VaultRegistryResult = {
  vaultNumber: number | null;
  created: boolean;
  resonance: number;
  entropy: number;
};

export const isVaultRegistryConfigured = () => Boolean(EIDOLON_BASE_URL);

/**
 * Best-effort registration. Returns null when not configured or on failure —
 * callers treat this as non-fatal and log, never throw at the user.
 */
export const registerVaultWithEidolon = async (
  registration: VaultRegistration,
  log?: FastifyBaseLogger,
): Promise<VaultRegistryResult | null> => {
  if (!EIDOLON_BASE_URL) {
    return null;
  }

  const body = JSON.stringify({
    vault_id: registration.vaultId,
    vault_name: registration.vaultName ?? '',
    vault_number: registration.vaultNumber ?? null,
    created_at: registration.createdAt ?? null,
    source: registration.source ?? 'cipher',
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (CIPHER_WEBHOOK_SECRET) {
    // Eidolon verifies the HMAC over the raw body it receives, so sign
    // exactly what is sent — nothing re-serialised.
    headers['X-Cipher-Signature'] = `sha256=${createHmac('sha256', CIPHER_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')}`;
  }
  if (EIDOLON_SECRET) {
    headers['X-Eidolon-Connect-Secret'] = EIDOLON_SECRET;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${EIDOLON_BASE_URL}/api/v1/cipher/vault/register`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log?.warn(
        { vaultId: registration.vaultId, status: response.status, detail: detail.slice(0, 200) },
        'Eidolon vault registration rejected',
      );
      return null;
    }

    const payload = (await response.json()) as {
      vault_number?: number | null;
      created?: boolean;
      resonance?: number;
      entropy?: number;
    };

    log?.info(
      {
        vaultId: registration.vaultId,
        vaultNumber: payload.vault_number ?? null,
        created: Boolean(payload.created),
      },
      'Vault registered with Eidolon',
    );

    return {
      vaultNumber: payload.vault_number ?? null,
      created: Boolean(payload.created),
      resonance: typeof payload.resonance === 'number' ? payload.resonance : 50,
      entropy: typeof payload.entropy === 'number' ? payload.entropy : 0,
    };
  } catch (error) {
    log?.warn(
      { err: error, vaultId: registration.vaultId },
      'Eidolon vault registration failed',
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
