/**
 * MasterKey Local Fallback Storage
 *
 * Used only when IndexedDB/KeyVault is unavailable (common on some mobile/private modes).
 * Stores the masterKey encrypted in localStorage using a password-derived AES-GCM key.
 */

const STORAGE_PREFIX = 'mk_fallback_v1:';
const PBKDF2_ITERATIONS = 100000;

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

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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
      iterations: PBKDF2_ITERATIONS,
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
  const key = await deriveAesKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const payload = concatBytes(salt, iv, new Uint8Array(encrypted));
  return bytesToBase64(payload);
}

async function decryptStringWithPassword(ciphertextB64: string, password: string): Promise<string | null> {
  try {
    const bytes = base64ToBytes(ciphertextB64);
    if (bytes.length < 16 + 12 + 1) return null;
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);
    const key = await deriveAesKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function storeMasterKeyFallback(username: string, masterKeyHex: string, password: string): Promise<boolean> {
  try {
    const key = `${STORAGE_PREFIX}${normalizeUsername(username)}`;
    const encrypted = await encryptStringWithPassword(masterKeyHex, password);
    localStorage.setItem(key, encrypted);
    return true;
  } catch {
    return false;
  }
}

export async function loadMasterKeyFallback(username: string, password: string): Promise<string | null> {
  const key = `${STORAGE_PREFIX}${normalizeUsername(username)}`;
  const encrypted = localStorage.getItem(key);
  if (!encrypted) return null;
  return decryptStringWithPassword(encrypted, password);
}

export function clearMasterKeyFallback(username: string): void {
  const key = `${STORAGE_PREFIX}${normalizeUsername(username)}`;
  localStorage.removeItem(key);
}
