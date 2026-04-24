/**
 * SRP-seed helpers — zero-knowledge proof of mnemonic possession.
 *
 * The backend exposes /api/v2/auth/srp-seed/{setup,login/init,login/verify}.
 * The mnemonic itself is used as the SRP "password": the server never sees
 * the mnemonic, only a verifier derived from it.
 *
 * Signup path:
 *   after POST /signup returns a mnemonic + session token, call
 *   computeSrpSeedSetup() and POST /srp-seed/setup with the Bearer token.
 *
 * Login path:
 *   user enters username + mnemonic. We exchange an SRP session via
 *   /srp-seed/login/init then /srp-seed/login/verify, and finally verify
 *   the server proof (M2) so a malicious server cannot complete the dance
 *   without knowing the verifier.
 */

import * as srpClient from 'secure-remote-password/client.js';
import * as bip39 from 'bip39';

export interface SrpSeedSetupCredentials {
  srpSalt: string;
  srpVerifier: string;
}

/**
 * Derive the masterKey hex string from a BIP-39 mnemonic — mirrors the
 * backend logic in SignupUseCase (`seed.subarray(0, 32).toString('hex')`).
 * Used by LoginMnemonic to initialize the E2EE KeyVault without a
 * round-trip through the server (zero-knowledge).
 */
export async function deriveMasterKeyFromMnemonic(mnemonic: string | string[]): Promise<string> {
  const words = Array.isArray(mnemonic) ? mnemonic.join(' ') : mnemonic;
  const normalized = words.trim().toLowerCase().split(/\s+/).join(' ');
  const seed = await bip39.mnemonicToSeed(normalized);
  return seed.subarray(0, 32).toString('hex');
}

/** Normalize the mnemonic so spacing / casing variants produce the same seed. */
function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Compute SRP-seed salt + verifier to register after signup so the user
 * can later log back in via their mnemonic alone.
 */
export function computeSrpSeedSetup(
  username: string,
  mnemonic: string | string[]
): SrpSeedSetupCredentials {
  const words = Array.isArray(mnemonic) ? mnemonic.join(' ') : mnemonic;
  const password = normalizeMnemonic(words);
  const user = normalizeUsername(username);

  const srpSalt = srpClient.generateSalt();
  const privateKey = srpClient.derivePrivateKey(srpSalt, user, password);
  const srpVerifier = srpClient.deriveVerifier(privateKey);

  return { srpSalt, srpVerifier };
}

/**
 * Compute classic SRP credentials from a device password. Used by the
 * quick-unlock flow so that /api/v2/auth/srp/login/init can verify the
 * user's password against srp_salt / srp_verifier stored server-side.
 *
 * Unlike computeSrpSeedSetup which normalizes its input as a BIP-39
 * mnemonic (lowercased, spaces collapsed), this one takes the password
 * verbatim — case and whitespace matter in a password.
 */
export function computeSrpPasswordSetup(
  username: string,
  password: string
): SrpSeedSetupCredentials {
  const user = normalizeUsername(username);
  const srpSalt = srpClient.generateSalt();
  const privateKey = srpClient.derivePrivateKey(srpSalt, user, password);
  const srpVerifier = srpClient.deriveVerifier(privateKey);
  return { srpSalt, srpVerifier };
}

/**
 * Login dance, step 1 — generate the client ephemeral. Returns a handle
 * that the caller must pass back into `finishSrpSeedLogin` with the
 * server response from /srp-seed/login/init.
 */
export interface SrpSeedLoginHandle {
  username: string;
  password: string;
  clientEphemeral: srpClient.Ephemeral;
}

export function startSrpSeedLogin(
  username: string,
  mnemonic: string | string[]
): SrpSeedLoginHandle {
  const words = Array.isArray(mnemonic) ? mnemonic.join(' ') : mnemonic;
  const password = normalizeMnemonic(words);
  const user = normalizeUsername(username);
  const clientEphemeral = srpClient.generateEphemeral();
  return { username: user, password, clientEphemeral };
}

/**
 * Step 2 — derive the session from the server's response. Produces the
 * proof M1 to POST to /srp-seed/login/verify. `clientSession` is kept
 * internally so verifyServerProof() below can validate M2 afterwards.
 */
export interface SrpSeedLoginFinish {
  M1: string;
  A: string;
  clientSession: srpClient.Session;
  verifyServerProof: (M2: string) => void;
}

export function continueSrpSeedLogin(
  handle: SrpSeedLoginHandle,
  server: { salt: string; B: string }
): SrpSeedLoginFinish {
  const privateKey = srpClient.derivePrivateKey(
    server.salt,
    handle.username,
    handle.password
  );
  const clientSession = srpClient.deriveSession(
    handle.clientEphemeral.secret,
    server.B,
    server.salt,
    handle.username,
    privateKey
  );
  const A = handle.clientEphemeral.public;

  return {
    M1: clientSession.proof,
    A,
    clientSession,
    verifyServerProof: (M2: string) => srpClient.verifySession(A, clientSession, M2),
  };
}
