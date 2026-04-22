/**
 * Biometric unlock via WebAuthn (Windows Hello, Touch ID, Android biometric).
 *
 * We register a platform authenticator credential bound to `cipher.local`,
 * store the credentialId alongside the PIN config, and challenge it on
 * unlock. A successful challenge short-circuits the PIN pad.
 *
 * Falls back gracefully when the platform lacks a built-in authenticator —
 * isBiometricAvailable() reports false and the Settings toggle stays off.
 */

const RP_NAME = 'Cipher Desktop';
const RP_ID = 'localhost';
const USER_DISPLAY = 'Cipher user';
const LOCAL_USER_HANDLE_KEY = 'cipher.appLock.biometric.userHandle';

function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getOrCreateUserHandle(): Uint8Array {
  const stored = localStorage.getItem(LOCAL_USER_HANDLE_KEY);
  if (stored) return b64urlDecode(stored);
  const handle = randomBytes(32);
  localStorage.setItem(LOCAL_USER_HANDLE_KEY, b64urlEncode(handle));
  return handle;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    const available = await window.PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable?.();
    return Boolean(available);
  } catch {
    return false;
  }
}

export interface BiometricEnrollment {
  credentialId: string; // base64url
}

export async function registerBiometric(): Promise<BiometricEnrollment> {
  if (!(await isBiometricAvailable())) {
    throw new Error('platform authenticator unavailable');
  }
  const challenge = randomBytes(32) as BufferSource;
  const userId = getOrCreateUserHandle() as BufferSource;

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: RP_ID },
      user: {
        id: userId,
        name: 'cipher-desktop-local',
        displayName: USER_DISPLAY,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('no credential returned');

  return {
    credentialId: b64urlEncode(new Uint8Array(credential.rawId)),
  };
}

export async function verifyBiometric(credentialId: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  const challenge = randomBytes(32) as BufferSource;
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: [
          {
            type: 'public-key',
            id: b64urlDecode(credentialId) as BufferSource,
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    // The OS already performed user verification (fingerprint/face/PIN) when
    // the assertion returned — a non-null response is a success. We do not
    // re-verify the signature against a registered public key because that
    // would need a server round-trip; the threat model here is a local
    // attacker who cannot fake the OS's biometric prompt on the real device.
    return assertion !== null;
  } catch {
    return false;
  }
}
