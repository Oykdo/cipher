/**
 * X3DH Protocol - Unit Tests
 * Tests Ed25519 signatures, key bundle creation, and handshake flow
 */

import { describe, it, expect, beforeAll } from 'vitest';
import _sodium from 'libsodium-wrappers';
import {
  generateX25519KeyPair,
  generateSigningKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createPublicKeyBundle,
  verifySignedPreKey,
  generateSessionId,
  createHandshakeInit,
  createHandshakeAck,
  createHandshakeSession,
  x3dhInitiator,
  x3dhResponder,
} from '../x3dh';

describe('X3DH Protocol', () => {
  beforeAll(async () => {
    await _sodium.ready;
  });

  describe('Key Generation', () => {
    it('should generate valid X25519 key pair', () => {
      const keyPair = generateX25519KeyPair();
      
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });

    it('should generate valid Ed25519 signing key pair', () => {
      const keyPair = generateSigningKeyPair();
      
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32); // Ed25519 public key
      expect(keyPair.privateKey.length).toBe(64); // Ed25519 private key (includes public)
    });

    it('should generate one-time pre-keys with correct IDs', () => {
      const opks = generateOneTimePreKeys(100, 5);
      
      expect(opks.length).toBe(5);
      expect(opks[0].id).toBe(100);
      expect(opks[4].id).toBe(104);
      opks.forEach(opk => {
        expect(opk.publicKey.length).toBe(32);
        expect(opk.privateKey.length).toBe(32);
      });
    });
  });

  describe('Ed25519 Signatures', () => {
    it('should generate signed pre-key with Ed25519 signature', async () => {
      const signingKeyPair = generateSigningKeyPair();
      const spk = await generateSignedPreKey(signingKeyPair.privateKey, 1);
      
      expect(spk.id).toBe(1);
      expect(spk.publicKey.length).toBe(32);
      expect(spk.signature.length).toBe(64); // Ed25519 signature
      expect(spk.privateKey.length).toBe(32);
    });

    it('should verify valid SPK signature', async () => {
      const signingKeyPair = generateSigningKeyPair();
      const spk = await generateSignedPreKey(signingKeyPair.privateKey, 1);
      
      const isValid = verifySignedPreKey(
        { id: spk.id, publicKey: spk.publicKey, signature: spk.signature },
        signingKeyPair.publicKey
      );
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid SPK signature (wrong key)', async () => {
      const signingKeyPair = generateSigningKeyPair();
      const wrongKeyPair = generateSigningKeyPair();
      const spk = await generateSignedPreKey(signingKeyPair.privateKey, 1);
      
      const isValid = verifySignedPreKey(
        { id: spk.id, publicKey: spk.publicKey, signature: spk.signature },
        wrongKeyPair.publicKey // Wrong key!
      );
      
      expect(isValid).toBe(false);
    });

    it('should reject tampered SPK signature', async () => {
      const signingKeyPair = generateSigningKeyPair();
      const spk = await generateSignedPreKey(signingKeyPair.privateKey, 1);
      
      // Tamper with the public key
      const tamperedPublicKey = new Uint8Array(spk.publicKey);
      tamperedPublicKey[0] ^= 0xFF;
      
      const isValid = verifySignedPreKey(
        { id: spk.id, publicKey: tamperedPublicKey, signature: spk.signature },
        signingKeyPair.publicKey
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('Public Key Bundle', () => {
    it('should create valid public key bundle with signing key', async () => {
      const identityKeyPair = generateX25519KeyPair();
      const signingKeyPair = generateSigningKeyPair();
      const spk = await generateSignedPreKey(signingKeyPair.privateKey, 1);
      const opks = generateOneTimePreKeys(1, 10);
      
      const bundle = createPublicKeyBundle(
        identityKeyPair.publicKey,
        signingKeyPair.publicKey,
        spk,
        opks
      );
      
      expect(bundle.identityKey).toEqual(identityKeyPair.publicKey);
      expect(bundle.signingKey).toEqual(signingKeyPair.publicKey);
      expect(bundle.signedPreKey.id).toBe(1);
      expect(bundle.oneTimePreKeys.length).toBe(10);
      expect(bundle.timestamp).toBeDefined();
    });
  });

  describe('Session ID Generation', () => {
    it('should generate valid UUID v4', () => {
      const sessionId = generateSessionId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionId).toMatch(uuidRegex);
    });

    it('should generate unique session IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Handshake Messages', () => {
    it('should create HANDSHAKE_INIT with sessionId', () => {
      const sessionId = generateSessionId();
      const identityKey = generateX25519KeyPair().publicKey;
      const ephemeralKey = generateX25519KeyPair().publicKey;
      
      const init = createHandshakeInit(sessionId, identityKey, ephemeralKey, 42);
      
      expect(init.type).toBe('HANDSHAKE_INIT');
      expect(init.sessionId).toBe(sessionId);
      expect(init.usedOneTimePreKeyId).toBe(42);
      expect(init.nonce).toBeDefined();
    });

    it('should create HANDSHAKE_ACK with matching sessionId', () => {
      const sessionId = generateSessionId();
      const ephemeralKey = generateX25519KeyPair().publicKey;
      const initNonce = _sodium.to_base64(_sodium.randombytes_buf(16));
      
      const ack = createHandshakeAck(sessionId, ephemeralKey, initNonce);
      
      expect(ack.type).toBe('HANDSHAKE_ACK');
      expect(ack.sessionId).toBe(sessionId);
      expect(ack.nonce).toBe(initNonce);
    });
  });

  describe('Handshake Session', () => {
    it('should create session with unique sessionId', () => {
      const session = createHandshakeSession('bob');
      
      expect(session.peerUsername).toBe('bob');
      expect(session.state).toBe('IDLE');
      expect(session.sessionId).toBeDefined();
      expect(session.sessionId.length).toBe(36); // UUID length
    });
  });

  describe('X3DH Key Agreement', () => {
    it('should derive same shared secret for initiator and responder', async () => {
      // Bob's keys (responder)
      const bobIdentityKeyPair = generateX25519KeyPair();
      const bobSigningKeyPair = generateSigningKeyPair();
      const bobSPK = await generateSignedPreKey(bobSigningKeyPair.privateKey, 1);
      const bobOPKs = generateOneTimePreKeys(1, 1);
      
      // Alice's keys (initiator)
      const aliceIdentityKeyPair = generateX25519KeyPair();
      const aliceEphemeralKeyPair = generateX25519KeyPair();
      
      // Alice computes shared secret
      const aliceSharedSecret = await x3dhInitiator(
        aliceIdentityKeyPair.privateKey,
        aliceEphemeralKeyPair.privateKey,
        bobIdentityKeyPair.publicKey,
        bobSPK.publicKey,
        bobOPKs[0].publicKey
      );
      
      // Bob computes shared secret
      const bobSharedSecret = await x3dhResponder(
        bobIdentityKeyPair.privateKey,
        bobSPK.privateKey,
        bobOPKs[0].privateKey,
        aliceIdentityKeyPair.publicKey,
        aliceEphemeralKeyPair.publicKey
      );
      
      // Shared secrets should match
      expect(aliceSharedSecret).toEqual(bobSharedSecret);
    });

    it('should derive same shared secret without OPK', async () => {
      // Bob's keys (responder)
      const bobIdentityKeyPair = generateX25519KeyPair();
      const bobSigningKeyPair = generateSigningKeyPair();
      const bobSPK = await generateSignedPreKey(bobSigningKeyPair.privateKey, 1);
      
      // Alice's keys (initiator)
      const aliceIdentityKeyPair = generateX25519KeyPair();
      const aliceEphemeralKeyPair = generateX25519KeyPair();
      
      // Alice computes shared secret (no OPK)
      const aliceSharedSecret = await x3dhInitiator(
        aliceIdentityKeyPair.privateKey,
        aliceEphemeralKeyPair.privateKey,
        bobIdentityKeyPair.publicKey,
        bobSPK.publicKey,
        undefined // No OPK
      );
      
      // Bob computes shared secret (no OPK)
      const bobSharedSecret = await x3dhResponder(
        bobIdentityKeyPair.privateKey,
        bobSPK.privateKey,
        undefined, // No OPK
        aliceIdentityKeyPair.publicKey,
        aliceEphemeralKeyPair.publicKey
      );
      
      // Shared secrets should match
      expect(aliceSharedSecret).toEqual(bobSharedSecret);
    });
  });
});
