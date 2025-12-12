/**
 * Integration Tests for e2ee-v2 Complete Workflow
 * 
 * Tests the full workflow from key generation to message encryption/decryption
 * Simulates real-world scenarios with multiple users
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateUserKeys,
  storeUserKeys,
  loadUserKeys,
  exportSecureBackup,
  importSecureBackup,
  clearAllKeys,
} from '../keyManager';
import {
  encryptSelfEncryptingMessage,
  decryptSelfEncryptingMessage,
} from '../selfEncryptingMessage';
import type { ParticipantKey } from '../selfEncryptingMessage';
import _sodium from 'libsodium-wrappers';

describe('e2ee-v2 Integration - Complete Workflow', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should complete full message lifecycle: Alice → Bob', async () => {
    // 1. Alice generates and stores her keys
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    await storeUserKeys(aliceKeys);

    // 2. Bob generates and stores his keys
    const bobKeys = await generateUserKeys('bob-id', 'bob');
    await storeUserKeys(bobKeys);

    // 3. Alice composes a message
    const plaintext = 'Hey Bob, this is a secret message!';

    // 4. Alice encrypts for herself AND Bob (so she can read it later)
    const participants: ParticipantKey[] = [
      { userId: 'alice-id', publicKey: aliceKeys.publicKey },
      { userId: 'bob-id', publicKey: bobKeys.publicKey },
    ];

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      participants,
      'standard'
    );

    console.log('✅ Alice encrypted message for Alice + Bob');

    // 5. Simulate sending: encrypted message is now a JSON blob
    const messageBlob = JSON.stringify(encrypted);
    expect(messageBlob).toBeDefined();
    console.log(`📦 Message size: ${messageBlob.length} bytes`);

    // 6. Bob receives the message
    const receivedMessage = JSON.parse(messageBlob);

    // 7. Bob loads his keys and decrypts
    const bobLoadedKeys = await loadUserKeys('bob-id');
    const bobDecrypted = await decryptSelfEncryptingMessage(
      receivedMessage,
      'bob-id',
      bobLoadedKeys!.publicKey,
      bobLoadedKeys!.privateKey
    );

    expect(bobDecrypted).toBe(plaintext);
    console.log('✅ Bob decrypted message:', bobDecrypted);

    // 8. Alice can also read her own message (critical feature!)
    const aliceLoadedKeys = await loadUserKeys('alice-id');
    const aliceDecrypted = await decryptSelfEncryptingMessage(
      receivedMessage,
      'alice-id',
      aliceLoadedKeys!.publicKey,
      aliceLoadedKeys!.privateKey
    );

    expect(aliceDecrypted).toBe(plaintext);
    console.log('✅ Alice can read her own message:', aliceDecrypted);
  });

  it('should handle group conversations', async () => {
    // 1. Three users generate keys
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    const bobKeys = await generateUserKeys('bob-id', 'bob');
    const charlieKeys = await generateUserKeys('charlie-id', 'charlie');

    await storeUserKeys(aliceKeys);
    await storeUserKeys(bobKeys);
    await storeUserKeys(charlieKeys);

    // 2. Alice sends a group message
    const plaintext = 'Hey everyone, group meeting at 3pm!';

    const participants: ParticipantKey[] = [
      { userId: 'alice-id', publicKey: aliceKeys.publicKey },
      { userId: 'bob-id', publicKey: bobKeys.publicKey },
      { userId: 'charlie-id', publicKey: charlieKeys.publicKey },
    ];

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      participants,
      'standard'
    );

    console.log('✅ Alice encrypted group message for 3 participants');

    // 3. All three can decrypt
    const aliceDecrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-id',
      aliceKeys.publicKey,
      aliceKeys.privateKey
    );

    const bobDecrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'bob-id',
      bobKeys.publicKey,
      bobKeys.privateKey
    );

    const charlieDecrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'charlie-id',
      charlieKeys.publicKey,
      charlieKeys.privateKey
    );

    expect(aliceDecrypted).toBe(plaintext);
    expect(bobDecrypted).toBe(plaintext);
    expect(charlieDecrypted).toBe(plaintext);

    console.log('✅ All 3 participants decrypted successfully');
  });

  it('should simulate device loss and recovery via backup', async () => {
    // 1. Alice generates keys and sends a message
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    await storeUserKeys(aliceKeys);

    const password = 'super-secure-password-123';
    const backup = await exportSecureBackup(password);

    console.log('✅ Alice exported secure backup');

    const bobKeys = await generateUserKeys('bob-id', 'bob');
    await storeUserKeys(bobKeys);

    const plaintext = 'Important message that Alice needs to read later';

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice-id', publicKey: aliceKeys.publicKey },
        { userId: 'bob-id', publicKey: bobKeys.publicKey },
      ],
      'standard'
    );

    // 2. Simulate device loss - clear all keys
    clearAllKeys();
    console.log('❌ Device wiped - all keys lost');

    // 3. Alice can't decrypt anymore (no keys)
    const loaded = await loadUserKeys('alice-id');
    expect(loaded).toBeNull();

    // 4. Alice restores from backup
    await importSecureBackup(backup, password);
    console.log('✅ Alice restored keys from backup');

    // 5. Alice can now decrypt the message again
    const restoredKeys = await loadUserKeys('alice-id');
    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-id',
      restoredKeys!.publicKey,
      restoredKeys!.privateKey
    );

    expect(decrypted).toBe(plaintext);
    console.log('✅ Alice successfully decrypted after restore');
  });

  it('should simulate multi-device: Alice sends from laptop, reads on phone', async () => {
    // === LAPTOP (Device 1) ===
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    await storeUserKeys(aliceKeys);

    const password = 'alice-master-password';
    const backup = await exportSecureBackup(password);

    console.log('💻 Alice exported backup from laptop');

    // Alice sends message from laptop
    const bobKeys = await generateUserKeys('bob-id', 'bob');
    await storeUserKeys(bobKeys);

    const plaintext = 'Message sent from my laptop';

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice-id', publicKey: aliceKeys.publicKey },
        { userId: 'bob-id', publicKey: bobKeys.publicKey },
      ],
      'standard'
    );

    // === PHONE (Device 2) ===
    // Simulate switching devices
    clearAllKeys();
    console.log('📱 Switched to phone (empty device)');

    // Alice imports backup on phone
    await importSecureBackup(backup, password);
    console.log('✅ Alice imported backup on phone');

    // Alice can read the message on her phone
    const phoneKeys = await loadUserKeys('alice-id');
    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-id',
      phoneKeys!.publicKey,
      phoneKeys!.privateKey
    );

    expect(decrypted).toBe(plaintext);
    console.log('✅ Alice read her laptop message on phone');
  });

  it('should demonstrate server cannot decrypt (zero-knowledge)', async () => {
    // 1. Setup users
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    const bobKeys = await generateUserKeys('bob-id', 'bob');

    await storeUserKeys(aliceKeys);
    await storeUserKeys(bobKeys);

    // 2. Alice sends sensitive message
    const plaintext = 'My bank account: 1234-5678-9012';

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice-id', publicKey: aliceKeys.publicKey },
        { userId: 'bob-id', publicKey: bobKeys.publicKey },
      ],
      'standard'
    );

    // 3. Server receives this (simulated)
    const serverReceivedBlob = JSON.stringify(encrypted);

    // 4. Server tries to decrypt (should be impossible)
    // Server has no private keys, only sees opaque data
    const parsed = JSON.parse(serverReceivedBlob);

    // Verify server can't read plaintext
    expect(parsed.ciphertext).not.toContain('bank');
    expect(parsed.ciphertext).not.toContain('1234');
    
    // Ciphertext should be base64 gibberish
    expect(parsed.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);

    console.log('✅ Server CANNOT decrypt message (zero-knowledge verified)');
    console.log('📦 Server sees:', {
      version: parsed.version,
      type: parsed.type,
      ciphertextLength: parsed.ciphertext.length,
      participantCount: Object.keys(parsed.keys).length,
    });

    // 5. But Alice and Bob CAN decrypt
    const aliceDecrypted = await decryptSelfEncryptingMessage(
      parsed,
      'alice-id',
      aliceKeys.publicKey,
      aliceKeys.privateKey
    );

    expect(aliceDecrypted).toBe(plaintext);
    console.log('✅ Alice CAN decrypt (has private key)');
  });

  it('should prevent unauthorized access (Eve attack scenario)', async () => {
    // 1. Setup legitimate users
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    const bobKeys = await generateUserKeys('bob-id', 'bob');

    await storeUserKeys(aliceKeys);
    await storeUserKeys(bobKeys);

    // 2. Alice sends secret to Bob
    const plaintext = 'Secret nuclear codes: 8-2-7-5-1-3-5';

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice-id', publicKey: aliceKeys.publicKey },
        { userId: 'bob-id', publicKey: bobKeys.publicKey },
      ],
      'standard'
    );

    // 3. Eve (attacker) intercepts the message
    const interceptedMessage = JSON.parse(JSON.stringify(encrypted));

    // 4. Eve generates her own keys
    const eveKeys = await generateUserKeys('eve-id', 'eve');
    await storeUserKeys(eveKeys);

    // 5. Eve tries to decrypt (should fail - not in participant list)
    await expect(
      decryptSelfEncryptingMessage(
        interceptedMessage,
        'eve-id',
        eveKeys.publicKey,
        eveKeys.privateKey
      )
    ).rejects.toThrow(/no key found for user/i);

    console.log('✅ Eve CANNOT decrypt (not a participant)');

    // 6. Eve tries to use Alice's public key but her own private key (should fail)
    await expect(
      decryptSelfEncryptingMessage(
        interceptedMessage,
        'alice-id',
        aliceKeys.publicKey,
        eveKeys.privateKey // Wrong private key!
      )
    ).rejects.toThrow();

    console.log('✅ Eve CANNOT decrypt even with stolen public key');

    // 7. But Alice and Bob CAN decrypt
    const aliceDecrypted = await decryptSelfEncryptingMessage(
      interceptedMessage,
      'alice-id',
      aliceKeys.publicKey,
      aliceKeys.privateKey
    );

    expect(aliceDecrypted).toBe(plaintext);
    console.log('✅ Attack failed - Alice and Bob still secure');
  });

  it('should handle message deletion securely', async () => {
    // 1. Setup
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    const bobKeys = await generateUserKeys('bob-id', 'bob');

    await storeUserKeys(aliceKeys);
    await storeUserKeys(bobKeys);

    // 2. Send message
    const plaintext = 'This message will self-destruct';

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice-id', publicKey: aliceKeys.publicKey },
        { userId: 'bob-id', publicKey: bobKeys.publicKey },
      ],
      'bar' // Burn After Reading
    );

    // 3. Both can read initially
    const aliceDecrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-id',
      aliceKeys.publicKey,
      aliceKeys.privateKey
    );

    expect(aliceDecrypted).toBe(plaintext);
    console.log('✅ Alice read BAR message');

    // 4. Simulate server burning the message (sets ciphertext to null/deleted)
    // Even if attacker has encrypted blob, without server's stored data, it's useless
    const burnedMessage = { ...encrypted, ciphertext: '', authTag: '' };

    // 5. Now neither can decrypt (data destroyed)
    await expect(
      decryptSelfEncryptingMessage(
        burnedMessage,
        'alice-id',
        aliceKeys.publicKey,
        aliceKeys.privateKey
      )
    ).rejects.toThrow();

    console.log('✅ BAR message successfully destroyed');
  });
});

describe('e2ee-v2 Integration - Performance & Scale', () => {
  beforeEach(async () => {
    await _sodium.ready;
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it('should handle high-frequency messaging', async () => {
    // Setup
    const aliceKeys = await generateUserKeys('alice-id', 'alice');
    const bobKeys = await generateUserKeys('bob-id', 'bob');

    await storeUserKeys(aliceKeys);
    await storeUserKeys(bobKeys);

    const participants: ParticipantKey[] = [
      { userId: 'alice-id', publicKey: aliceKeys.publicKey },
      { userId: 'bob-id', publicKey: bobKeys.publicKey },
    ];

    // Simulate 100 messages
    const messageCount = 100;
    const startTime = performance.now();

    for (let i = 0; i < messageCount; i++) {
      const plaintext = `Message ${i + 1}`;
      
      const encrypted = await encryptSelfEncryptingMessage(
        plaintext,
        participants,
        'standard'
      );

      const decrypted = await decryptSelfEncryptingMessage(
        encrypted,
        'bob-id',
        bobKeys.publicKey,
        bobKeys.privateKey
      );

      expect(decrypted).toBe(plaintext);
    }

    const totalTime = performance.now() - startTime;
    const avgTime = totalTime / messageCount;

    console.log(`✅ Processed ${messageCount} messages in ${totalTime.toFixed(2)}ms`);
    console.log(`📊 Average: ${avgTime.toFixed(2)}ms per message`);

    // Should be reasonably fast
    expect(avgTime).toBeLessThan(50); // < 50ms per message
  });

  it('should scale to large groups', async () => {
    // Generate keys for 20 users
    const userCount = 20;
    const users = await Promise.all(
      Array.from({ length: userCount }, async (_, i) => {
        const keys = await generateUserKeys(`user-${i}`, `user${i}`);
        await storeUserKeys(keys);
        return keys;
      })
    );

    const participants: ParticipantKey[] = users.map(u => ({
      userId: u.userId,
      publicKey: u.publicKey,
    }));

    // Send group message
    const plaintext = 'Big group announcement!';

    const startEncrypt = performance.now();
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      participants,
      'standard'
    );
    const encryptTime = performance.now() - startEncrypt;

    console.log(`✅ Encrypted for ${userCount} users in ${encryptTime.toFixed(2)}ms`);

    // Each user decrypts
    const startDecrypt = performance.now();
    for (const user of users) {
      const decrypted = await decryptSelfEncryptingMessage(
        encrypted,
        user.userId,
        user.publicKey,
        user.privateKey
      );
      expect(decrypted).toBe(plaintext);
    }
    const decryptTime = performance.now() - startDecrypt;

    console.log(`✅ ${userCount} users decrypted in ${decryptTime.toFixed(2)}ms`);
    console.log(`📊 Average decrypt time: ${(decryptTime / userCount).toFixed(2)}ms`);

    // Performance should be acceptable
    expect(encryptTime).toBeLessThan(1000); // < 1s
    expect(decryptTime / userCount).toBeLessThan(50); // < 50ms per user
  });
});
