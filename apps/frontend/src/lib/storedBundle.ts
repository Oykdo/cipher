import _sodium from 'libsodium-wrappers';

/**
 * Device-local encrypted storage for `.eidolon_keybundle` files.
 *
 * The bundle format itself (CLI-interop) stays passwordless. This wrapper is
 * purely a convenience layer: once a user has imported a keybundle on this
 * device, they can opt in to saving it under a password so the next login
 * only requires the password, not the file.
 *
 * Encryption: PBKDF2-SHA256 (600k iter) → 32-byte key → XChaCha20-Poly1305.
 * Matches the scheme used by Cipher's RGPD backup export for consistency.
 *
 * File format (one `.enc` per vault under `userData/stored_bundles/`):
 *
 *   offset  size   field
 *   0       8      magic bytes "CIPHERSB"
 *   8       1      format version (u8) — starts at 1
 *   9       16     PBKDF2 salt
 *   25      24     XChaCha20-Poly1305 nonce
 *   49      N      ciphertext (libsodium output = plaintext + 16-byte MAC)
 */

const MAGIC = new TextEncoder().encode('CIPHERSB');
const FORMAT_VERSION = 1;
const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const NONCE_BYTES = 24;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + 1 + SALT_BYTES + NONCE_BYTES;

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBuffer = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function encryptStoredBundle(
  bundleBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  await _sodium.ready;
  const salt = _sodium.randombytes_buf(SALT_BYTES);
  const nonce = _sodium.randombytes_buf(NONCE_BYTES);
  const key = await deriveKey(password, salt);
  const ciphertext = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    bundleBytes,
    null,
    null,
    nonce,
    key,
  );
  const out = new Uint8Array(HEADER_BYTES + ciphertext.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = FORMAT_VERSION;
  out.set(salt, MAGIC.length + 1);
  out.set(nonce, MAGIC.length + 1 + SALT_BYTES);
  out.set(ciphertext, HEADER_BYTES);
  return out;
}

export async function decryptStoredBundle(
  blob: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  await _sodium.ready;
  if (blob.length < HEADER_BYTES + _sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    throw new Error('stored bundle too short');
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (blob[i] !== MAGIC[i]) throw new Error('stored bundle magic mismatch');
  }
  if (blob[MAGIC.length] !== FORMAT_VERSION) {
    throw new Error(`unsupported stored bundle version: ${blob[MAGIC.length]}`);
  }
  const salt = blob.slice(MAGIC.length + 1, MAGIC.length + 1 + SALT_BYTES);
  const nonce = blob.slice(MAGIC.length + 1 + SALT_BYTES, HEADER_BYTES);
  const cipher = blob.slice(HEADER_BYTES);
  const key = await deriveKey(password, salt);
  try {
    return _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      cipher,
      null,
      nonce,
      key,
    );
  } catch {
    throw new Error('wrong password or corrupt stored bundle');
  }
}

// -----------------------------------------------------------------------------
// Electron IPC wrappers
// -----------------------------------------------------------------------------

export type StoredBundleEntry = {
  vaultId: string;
  vaultName: string;
  savedAt: string;
};

export async function saveStoredBundle(
  vaultId: string,
  vaultName: string,
  encryptedBlob: Uint8Array,
): Promise<void> {
  if (!window.electron?.storedBundle?.save) {
    throw new Error('Device-local bundle storage requires the Cipher desktop app');
  }
  await window.electron.storedBundle.save(vaultId, vaultName, encryptedBlob);
}

export async function loadStoredBundle(vaultId: string): Promise<Uint8Array | null> {
  if (!window.electron?.storedBundle?.load) return null;
  const res = await window.electron.storedBundle.load(vaultId);
  if (!res?.ok || !res.bytes) return null;
  return res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
}

export async function listStoredBundles(): Promise<StoredBundleEntry[]> {
  if (!window.electron?.storedBundle?.list) return [];
  const res = await window.electron.storedBundle.list();
  return res?.entries ?? [];
}

export async function deleteStoredBundle(vaultId: string): Promise<void> {
  if (!window.electron?.storedBundle?.delete) return;
  await window.electron.storedBundle.delete(vaultId);
}
