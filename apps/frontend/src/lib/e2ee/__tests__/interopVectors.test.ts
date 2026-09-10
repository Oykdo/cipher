/**
 * Interop vectors desktop <-> mobile (handover step 13).
 *
 * `interopVectors.json` is the shared reference: the exact same file is
 * committed in the mobile repo (`cipher-mobile/src/crypto/e2ee/__tests__/`)
 * and both suites assert against it. Any drift on either side turns red
 * immediately -- no bridge, no network, no emulator required.
 *
 * Why this exists: the bug fixed by 91dfb64 here (responder ratchet seeded
 * with the identity key instead of the signed pre-key) survived the whole
 * unit suite, because the integration tests wire the primitives themselves
 * with the correct pairing. Only an end-to-end network harness surfaced it.
 * Frozen vectors catch that class of defect for free.
 *
 * The private keys in the file are test material derived from the plaintext
 * masterKeys listed in the vectors -- they protect nothing.
 *
 * Regeneration is done on the MOBILE side (it owns the generator):
 *
 *   cd cipher-mobile && CIPHER_UPDATE_VECTORS=1 npx jest interopVectors
 *
 * then copy the regenerated JSON here. Only do that for an intentional
 * protocol change, and land both repos together.
 */
/**
 * @vitest-environment node
 *
 * Runs in the Node environment, not the project-wide jsdom one. Under jsdom,
 * `sodium.from_string()` builds its Uint8Array with jsdom's TextEncoder, from
 * the jsdom realm; libsodium then rejects it with "unsupported input type for
 * message" because its own `instanceof Uint8Array` check runs against the
 * Node realm. Every deterministic key derivation goes through from_string, so
 * under jsdom this suite fails for a reason that has nothing to do with
 * crypto. These vectors exercise pure crypto with no DOM involved, so the
 * node environment is both the correct and the simplest fix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import _sodium from 'libsodium-wrappers';

import {
  base64ToBytes,
  bytesToBase64,
  generateDeterministicIdentityKeyPair,
  generateDeterministicSigningKeyPair,
  generateFingerprint,
  signData,
} from '../index';
import { verifySignedPreKey, x3dhInitiator, x3dhResponder } from '../x3dh';

import vectors from './interopVectors.json';

/** Big-endian uint32, mirroring the module-private helper in x3dh.ts. */
const numberToBytes = (value: number): Uint8Array => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, false);
  return new Uint8Array(buffer);
};

describe('Interop vectors (desktop <-> mobile)', () => {
  beforeAll(async () => {
    await _sodium.ready;
  });

  it('derives the same deterministic identity keys', async () => {
    const alice = await generateDeterministicIdentityKeyPair(vectors.seeds.alice);
    const bob = await generateDeterministicIdentityKeyPair(vectors.seeds.bob);

    expect(bytesToBase64(alice.publicKey)).toBe(vectors.alice.identityPublicKey);
    expect(bytesToBase64(alice.privateKey)).toBe(vectors.alice.identityPrivateKey);
    expect(bytesToBase64(bob.publicKey)).toBe(vectors.bob.identityPublicKey);
    expect(bytesToBase64(bob.privateKey)).toBe(vectors.bob.identityPrivateKey);
  });

  it('derives the same deterministic signing keys', async () => {
    const alice = await generateDeterministicSigningKeyPair(vectors.seeds.alice);
    const bob = await generateDeterministicSigningKeyPair(vectors.seeds.bob);

    expect(bytesToBase64(alice.publicKey)).toBe(vectors.alice.signingPublicKey);
    expect(bytesToBase64(bob.publicKey)).toBe(vectors.bob.signingPublicKey);
  });

  it('produces the same fingerprint format', async () => {
    const fingerprint = await generateFingerprint(
      base64ToBytes(vectors.alice.identityPublicKey)
    );

    expect(fingerprint).toBe(vectors.alice.identityFingerprint);
    // Uppercase hex in groups of 4: the string shown to the user on both
    // platforms, hence contractual.
    expect(fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4})*$/);
  });

  it('accepts the signed pre-key signature from the vectors', () => {
    const valid = verifySignedPreKey(
      {
        id: vectors.signedPreKeyId,
        publicKey: base64ToBytes(vectors.bob.signedPreKeyPublic),
        signature: base64ToBytes(vectors.bob.signedPreKeySignature),
      },
      base64ToBytes(vectors.bob.signingPublicKey)
    );

    expect(valid).toBe(true);
  });

  it('reproduces the signed pre-key signature byte for byte', async () => {
    const bobSigning = await generateDeterministicSigningKeyPair(vectors.seeds.bob);
    const message = new Uint8Array([
      ...base64ToBytes(vectors.bob.signedPreKeyPublic),
      ...numberToBytes(vectors.signedPreKeyId),
    ]);

    // signData already returns base64 through sodium.to_base64, the same
    // variant the vectors were generated with.
    const signature = await signData(message, bobSigning.privateKey);

    expect(signature).toBe(vectors.bob.signedPreKeySignature);
  });

  it('computes the same X3DH secret as initiator, with and without OPK', async () => {
    const withOpk = await x3dhInitiator(
      base64ToBytes(vectors.alice.identityPrivateKey),
      base64ToBytes(vectors.alice.ephemeralPrivateKey),
      base64ToBytes(vectors.bob.identityPublicKey),
      base64ToBytes(vectors.bob.signedPreKeyPublic),
      base64ToBytes(vectors.bob.oneTimePreKeyPublic)
    );
    const withoutOpk = await x3dhInitiator(
      base64ToBytes(vectors.alice.identityPrivateKey),
      base64ToBytes(vectors.alice.ephemeralPrivateKey),
      base64ToBytes(vectors.bob.identityPublicKey),
      base64ToBytes(vectors.bob.signedPreKeyPublic)
    );

    expect(bytesToBase64(withOpk)).toBe(vectors.x3dh.sharedSecretWithOpk);
    expect(bytesToBase64(withoutOpk)).toBe(vectors.x3dh.sharedSecretWithoutOpk);
    expect(bytesToBase64(withOpk)).not.toBe(vectors.x3dh.sharedSecretWithoutOpk);
  });

  it('computes the same X3DH secret as responder', async () => {
    const withOpk = await x3dhResponder(
      base64ToBytes(vectors.bob.identityPrivateKey),
      base64ToBytes(vectors.bob.signedPreKeyPrivate),
      base64ToBytes(vectors.bob.oneTimePreKeyPrivate),
      base64ToBytes(vectors.alice.identityPublicKey),
      base64ToBytes(vectors.alice.ephemeralPublicKey)
    );
    const withoutOpk = await x3dhResponder(
      base64ToBytes(vectors.bob.identityPrivateKey),
      base64ToBytes(vectors.bob.signedPreKeyPrivate),
      undefined,
      base64ToBytes(vectors.alice.identityPublicKey),
      base64ToBytes(vectors.alice.ephemeralPublicKey)
    );

    // The responder must land on the initiator's secret: that is the
    // property desktop/mobile interop depends on.
    expect(bytesToBase64(withOpk)).toBe(vectors.x3dh.sharedSecretWithOpk);
    expect(bytesToBase64(withoutOpk)).toBe(vectors.x3dh.sharedSecretWithoutOpk);
  });
});
