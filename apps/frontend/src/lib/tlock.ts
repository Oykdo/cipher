/**
 * Time-lock encryption via drand (tlock).
 *
 * Replaces the previous server-enforced blockchain gate. A message's
 * symmetric key is encrypted towards a future drand beacon round using
 * identity-based encryption (BLS12-381). The key material is
 * cryptographically inaccessible until the drand network publishes the
 * signature for that round — not "until our client says so".
 *
 * External review (2026-01) flagged that the legacy design was breakable
 * by a modified client or compromised server. This module is the
 * replacement — see ECOSYSTEM_GATING.md "Timelock" section.
 */

import {
  mainnetClient,
  timelockEncrypt,
  timelockDecrypt,
  roundAt,
  roundTime,
  Buffer,
  type HttpChainClient,
  type ChainInfo,
} from 'tlock-js';

// Lazy-init the drand client so we pay the network handshake only when
// the user actually time-locks something.
let _client: HttpChainClient | null = null;
let _chainInfo: ChainInfo | null = null;

function getClient(): HttpChainClient {
  if (!_client) _client = mainnetClient();
  return _client;
}

async function getChainInfo(): Promise<ChainInfo> {
  if (_chainInfo) return _chainInfo;
  _chainInfo = await getClient().chain().info();
  return _chainInfo;
}

/**
 * Compute the drand round that will be published at the requested wall-clock
 * time. Rounds tick every `chainInfo.period` seconds (3s on mainnet).
 */
export async function roundForTimestamp(unixMs: number): Promise<number> {
  const info = await getChainInfo();
  return roundAt(unixMs, info);
}

/**
 * Reverse: estimate when a given drand round will be published. Useful for
 * countdown displays on messages the user already received.
 */
export async function estimatedTimestampForRound(round: number): Promise<number> {
  const info = await getChainInfo();
  return roundTime(info, round);
}

/**
 * Has the drand network published the signature for this round yet?
 * If yes, the tlock ciphertext can be decrypted. If no, nobody can.
 */
export async function isRoundAvailable(round: number): Promise<boolean> {
  try {
    const latest = await getClient().latest();
    return latest.round >= round;
  } catch {
    // Network failure → treat as "not yet" rather than false-positive unlock.
    return false;
  }
}

/**
 * Encrypt a symmetric key (message-level) towards a future drand round.
 * Returns an AGE-formatted ciphertext string ready to be stored alongside
 * the message. The caller is responsible for keeping the `round` number
 * — the recipient needs it to fetch the right beacon round.
 */
export async function encryptKeyToRound(
  keyBytes: Uint8Array,
  round: number,
): Promise<string> {
  const payload = Buffer.from(keyBytes);
  return timelockEncrypt(round, payload, getClient());
}

/**
 * Attempt to decrypt a tlock ciphertext. Succeeds only if the target round
 * has been published by drand — otherwise tlock-js throws and we bubble up.
 */
export async function decryptKeyFromCiphertext(
  ciphertext: string,
): Promise<Uint8Array> {
  const buf = await timelockDecrypt(ciphertext, getClient());
  return new Uint8Array(buf);
}

/**
 * Convenience: given a future UNIX ms timestamp, return both the round
 * number and the estimated wall-clock time that round will actually drop
 * (useful for UI — a round computed from `now + 60s` may land at
 * `now + 60s ± period`).
 */
export async function scheduleLockAt(unixMs: number): Promise<{
  round: number;
  estimatedUnlockMs: number;
}> {
  const round = await roundForTimestamp(unixMs);
  const estimatedUnlockMs = await estimatedTimestampForRound(round);
  return { round, estimatedUnlockMs };
}
