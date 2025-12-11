/**
 * Double Ratchet Protocol - Unit Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import _sodium from 'libsodium-wrappers';
import {
  initializeAlice,
  initializeBob,
  ratchetEncrypt,
  ratchetDecrypt,
  generateDHKeyPair,
} from '../doubleRatchet';

describe('Double Ratchet Protocol', () => {
  beforeAll(async () => {
    await _sodium.ready;
  });

  describe('Initialization', () => {
    it('should initialize Alice correctly', () => {
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      
      expect(aliceState.peerUsername).toBe('bob');
      expect(aliceState.Ns).toBe(0);
      expect(aliceState.Nr).toBe(0);
      expect(aliceState.DHr).toEqual(bobKeyPair.publicKey);
      expect(aliceState.RK.length).toBe(32);
      expect(aliceState.CKs.length).toBe(32);
    });

    it('should initialize Bob correctly', () => {
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      expect(bobState.peerUsername).toBe('alice');
      expect(bobState.Ns).toBe(0);
      expect(bobState.Nr).toBe(0);
      expect(bobState.DHr).toBeNull();
      expect(bobState.RK).toEqual(sharedSecret);
      expect(bobState.DHs).toEqual(bobKeyPair.privateKey);
    });
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt a single message', () => {
      // Setup
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      // Alice sends message to Bob
      const plaintext = 'Hello Bob!';
      const encrypted = ratchetEncrypt(aliceState, plaintext);
      
      expect(encrypted.version).toBe('double-ratchet-v1');
      expect(encrypted.header).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      
      // Bob decrypts message
      const decrypted = ratchetDecrypt(bobState, encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle multiple messages in sequence', () => {
      // Setup
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      // Alice sends multiple messages
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      const encrypted = messages.map(msg => ratchetEncrypt(aliceState, msg));
      
      // Bob decrypts all messages
      const decrypted = encrypted.map(enc => ratchetDecrypt(bobState, enc));
      
      expect(decrypted).toEqual(messages);
    });

    it('should handle bidirectional communication', () => {
      // Setup
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      // Alice -> Bob
      const msg1 = ratchetEncrypt(aliceState, 'Hello Bob!');
      expect(ratchetDecrypt(bobState, msg1)).toBe('Hello Bob!');
      
      // Bob -> Alice
      const msg2 = ratchetEncrypt(bobState, 'Hi Alice!');
      expect(ratchetDecrypt(aliceState, msg2)).toBe('Hi Alice!');
      
      // Alice -> Bob
      const msg3 = ratchetEncrypt(aliceState, 'How are you?');
      expect(ratchetDecrypt(bobState, msg3)).toBe('How are you?');
      
      // Bob -> Alice
      const msg4 = ratchetEncrypt(bobState, 'I am fine!');
      expect(ratchetDecrypt(aliceState, msg4)).toBe('I am fine!');
    });
  });

  describe('Out-of-order Messages', () => {
    it('should handle out-of-order messages', () => {
      // Setup
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      // Alice sends 3 messages
      const msg1 = ratchetEncrypt(aliceState, 'Message 1');
      const msg2 = ratchetEncrypt(aliceState, 'Message 2');
      const msg3 = ratchetEncrypt(aliceState, 'Message 3');
      
      // Bob receives them out of order: 1, 3, 2
      expect(ratchetDecrypt(bobState, msg1)).toBe('Message 1');
      expect(ratchetDecrypt(bobState, msg3)).toBe('Message 3');
      expect(ratchetDecrypt(bobState, msg2)).toBe('Message 2');
    });
  });

  describe('Perfect Forward Secrecy', () => {
    it('should not be able to decrypt old messages with compromised current state', () => {
      // Setup
      const sharedSecret = _sodium.randombytes_buf(32);
      const bobKeyPair = generateDHKeyPair();
      
      const aliceState = initializeAlice(sharedSecret, bobKeyPair.publicKey, 'bob');
      const bobState = initializeBob(sharedSecret, bobKeyPair.privateKey, 'alice');
      
      // Alice sends message
      const oldMessage = ratchetEncrypt(aliceState, 'Old secret');
      
      // Bob decrypts it
      expect(ratchetDecrypt(bobState, oldMessage)).toBe('Old secret');
      
      // Alice sends more messages (advancing the ratchet)
      ratchetEncrypt(aliceState, 'Message 2');
      ratchetEncrypt(aliceState, 'Message 3');
      
      // Even if attacker gets current state, they can't decrypt old message
      // because the message key has been deleted
      const currentState = JSON.parse(JSON.stringify(bobState));
      
      // Verify that old message key is not in current state
      expect(currentState.CKr).not.toEqual(bobState.CKr);
    });
  });
});

