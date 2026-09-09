/**
 * MasterKey Local Fallback Storage
 *
 * Used only when IndexedDB/KeyVault is unavailable (common on some mobile/private modes).
 * Stores the masterKey encrypted in localStorage using a password-derived AES-GCM key.
 */

// v2 = 600k iterations, matching secureStorage.ts and QuickUnlock.tsx and the
// current OWASP guidance for PBKDF2-SHA256. This blob protects the master key,
// from which the e2ee identity private key is derived deterministically, so
// breaking it yields every message, past and future, on every device. v1 sat
// at 100k, six times cheaper to attack offline than the rest of the codebase.
//
// v1 is still READ, at its original 100k, so an existing blob keeps working and
// is transparently re-encrypted to v2 on the next successful load. Bumping the
// iteration count without this would have made every stored blob undecryptable
// and silently lost the user their master key.
const STORAGE_PREFIX_V2 = 'mk_fallback_v2:';
const PBKDF2_ITERATIONS_V2 = 600000;

const STORAGE_PREFIX_V1 = 'mk_fallback_v1:';
const PBKDF2_ITERATIONS_V1 = 100000;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptStringWithPassword(plaintext: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, PBKDF2_ITERATIONS_V2);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const payload = concatBytes(salt, iv, new Uint8Array(encrypted));
  return bytesToBase64(payload);
}

async function decryptStringWithPassword(
  ciphertextB64: string,
  password: string,
  iterations: number
): Promise<string | null> {
  try {
    const bytes = base64ToBytes(ciphertextB64);
    if (bytes.length < 16 + 12 + 1) return null;
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);
    const key = await deriveAesKey(password, salt, iterations);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function storeMasterKeyFallback(username: string, masterKeyHex: string, password: string): Promise<boolean> {
  try {
    const name = normalizeUsername(username);
    const encrypted = await encryptStringWithPassword(masterKeyHex, password);
    localStorage.setItem(`${STORAGE_PREFIX_V2}${name}`, encrypted);
    // A v1 blob left behind would still be attackable at 100k.
    localStorage.removeItem(`${STORAGE_PREFIX_V1}${name}`);
    return true;
  } catch {
    return false;
  }
}

export async function loadMasterKeyFallback(username: string, password: string): Promise<string | null> {
  const name = normalizeUsername(username);

  const v2 = localStorage.getItem(`${STORAGE_PREFIX_V2}${name}`);
  if (v2) {
    return decryptStringWithPassword(v2, password, PBKDF2_ITERATIONS_V2);
  }

  // Legacy blob: decrypt at the old cost, then upgrade it in place so the
  // weaker copy stops existing. A failed re-encrypt must not lose the key, so
  // the plaintext is returned either way.
  const v1 = localStorage.getItem(`${STORAGE_PREFIX_V1}${name}`);
  if (!v1) return null;

  const plaintext = await decryptStringWithPassword(v1, password, PBKDF2_ITERATIONS_V1);
  if (plaintext === null) return null;

  try {
    const upgraded = await encryptStringWithPassword(plaintext, password);
    localStorage.setItem(`${STORAGE_PREFIX_V2}${name}`, upgraded);
    localStorage.removeItem(`${STORAGE_PREFIX_V1}${name}`);
  } catch {
    // Keep the v1 blob rather than leave the user with nothing.
  }
  return plaintext;
}

export function clearMasterKeyFallback(username: string): void {
  const name = normalizeUsername(username);
  localStorage.removeItem(`${STORAGE_PREFIX_V2}${name}`);
  localStorage.removeItem(`${STORAGE_PREFIX_V1}${name}`);
}
