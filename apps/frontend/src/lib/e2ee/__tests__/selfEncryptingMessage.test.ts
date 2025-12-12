/**
 * Tests for SelfEncryptingMessage (e2ee-v2)
 * 
 * Tests:
 * - Message encryption/decryption
 * - Multi-participant support
 * - Key wrapping/unwrapping
 * - Format validation
 * - Error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptSelfEncryptingMessage,
  decryptSelfEncryptingMessage,
  isSelfEncryptingMessage,
  getMessageParticipants,
  canUserDecryptMessage,
  estimateEncryptedSize,
  validateEncryptedMessage,
} from '../selfEncryptingMessage';
import type { ParticipantKey } from '../selfEncryptingMessage';
import _sodium from 'libsodium-wrappers';

// Helper to generate participant keys
async function generateParticipant(userId: string): Promise<{
  participant: ParticipantKey;
  privateKey: Uint8Array;
}> {
  await _sodium.ready;
  const keypair = _sodium.crypto_box_keypair();

  return {
    participant: {
      userId,
      publicKey: keypair.publicKey,
    },
    privateKey: keypair.privateKey,
  };
}

describe('SelfEncryptingMessage - Basic Encryption/Decryption', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should encrypt and decrypt a simple message', async () => {
    const plaintext = 'Hello, World!';
    const alice = await generateParticipant('alice-123');

    // Encrypt for Alice
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Verify structure
    expect(encrypted.version).toBe('e2ee-v2');
    expect(encrypted.type).toBe('standard');
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.keys['alice-123']).toBeDefined();

    // Decrypt
    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-123',
      alice.participant.publicKey,
      alice.privateKey
    );

    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt for multiple participants', async () => {
    const plaintext = 'Secret group message';
    const alice = await generateParticipant('alice-123');
    const bob = await generateParticipant('bob-456');
    const charlie = await generateParticipant('charlie-789');

    // Encrypt for all three
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant, bob.participant, charlie.participant],
      'standard'
    );

    // Each participant should have a wrapped key
    expect(Object.keys(encrypted.keys)).toHaveLength(3);
    expect(encrypted.keys['alice-123']).toBeDefined();
    expect(encrypted.keys['bob-456']).toBeDefined();
    expect(encrypted.keys['charlie-789']).toBeDefined();

    // All three should be able to decrypt
    const decryptedAlice = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-123',
      alice.participant.publicKey,
      alice.privateKey
    );
    const decryptedBob = await decryptSelfEncryptingMessage(
      encrypted,
      'bob-456',
      bob.participant.publicKey,
      bob.privateKey
    );
    const decryptedCharlie = await decryptSelfEncryptingMessage(
      encrypted,
      'charlie-789',
      charlie.participant.publicKey,
      charlie.privateKey
    );

    expect(decryptedAlice).toBe(plaintext);
    expect(decryptedBob).toBe(plaintext);
    expect(decryptedCharlie).toBe(plaintext);
  });

  it('should encrypt messages of different lengths', async () => {
    const alice = await generateParticipant('alice-123');

    const testCases = [
      '',                                      // Empty
      'a',                                     // Single char
      'Short message',                         // Short
      'A'.repeat(1000),                        // Long
      '🔒🔑💬',                                // Emojis
      'Multi\nLine\nMessage\nWith\nBreaks',   // Newlines
    ];

    for (const plaintext of testCases) {
      const encrypted = await encryptSelfEncryptingMessage(
        plaintext,
        [alice.participant],
        'standard'
      );

      const decrypted = await decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      );

      expect(decrypted).toBe(plaintext);
    }
  });

  it('should handle Unicode and special characters', async () => {
    const plaintext = '日本語 Français Español 中文 العربية 🌍🌎🌏';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-123',
      alice.participant.publicKey,
      alice.privateKey
    );

    expect(decrypted).toBe(plaintext);
  });
});

describe('SelfEncryptingMessage - Message Types', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should support different message types', async () => {
    const plaintext = 'Test message';
    const alice = await generateParticipant('alice-123');

    const types = ['standard', 'bar', 'timelock', 'attachment'] as const;

    for (const type of types) {
      const encrypted = await encryptSelfEncryptingMessage(
        plaintext,
        [alice.participant],
        type
      );

      expect(encrypted.type).toBe(type);

      const decrypted = await decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      );

      expect(decrypted).toBe(plaintext);
    }
  });

  it('should support metadata for attachments', async () => {
    const plaintext = JSON.stringify({ data: 'attachment data' });
    const alice = await generateParticipant('alice-123');

    const metadata = {
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 123456,
    };

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'attachment',
      metadata
    );

    // Metadata should be present and unencrypted
    expect(encrypted.metadata).toEqual(metadata);

    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-123',
      alice.participant.publicKey,
      alice.privateKey
    );

    expect(decrypted).toBe(plaintext);
  });
});

describe('SelfEncryptingMessage - Security Properties', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should generate unique IV for each message', async () => {
    const plaintext = 'Same message';
    const alice = await generateParticipant('alice-123');

    const encrypted1 = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );
    const encrypted2 = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // IVs should be different
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    // Ciphertexts should be different
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should generate unique message keys', async () => {
    const plaintext = 'Same message';
    const alice = await generateParticipant('alice-123');

    const encrypted1 = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );
    const encrypted2 = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Wrapped keys should be different (different message keys)
    expect(encrypted1.keys['alice-123']).not.toBe(encrypted2.keys['alice-123']);
  });

  it('should fail decryption with wrong private key', async () => {
    const plaintext = 'Secret message';
    const alice = await generateParticipant('alice-123');
    const eve = await generateParticipant('eve-999');

    // Encrypt for Alice
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Eve tries to decrypt with her own private key (should fail)
    await expect(
      decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        eve.privateKey // Wrong private key!
      )
    ).rejects.toThrow();
  });

  it('should fail decryption if user not in participant list', async () => {
    const plaintext = 'Secret message';
    const alice = await generateParticipant('alice-123');
    const bob = await generateParticipant('bob-456');

    // Encrypt for Alice only
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Bob tries to decrypt (not in participant list)
    await expect(
      decryptSelfEncryptingMessage(
        encrypted,
        'bob-456',
        bob.participant.publicKey,
        bob.privateKey
      )
    ).rejects.toThrow(/no key found for user/i);
  });

  it('should detect tampering with ciphertext', async () => {
    const plaintext = 'Original message';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Tamper with ciphertext
    const tamperedCiphertext = _sodium.from_base64(encrypted.ciphertext);
    tamperedCiphertext[0] ^= 0xFF; // Flip bits
    encrypted.ciphertext = _sodium.to_base64(tamperedCiphertext);

    // Decryption should fail (GCM authentication)
    await expect(
      decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      )
    ).rejects.toThrow();
  });

  it('should detect tampering with auth tag', async () => {
    const plaintext = 'Original message';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Tamper with auth tag
    const tamperedAuthTag = _sodium.from_base64(encrypted.authTag);
    tamperedAuthTag[0] ^= 0xFF;
    encrypted.authTag = _sodium.to_base64(tamperedAuthTag);

    // Decryption should fail
    await expect(
      decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      )
    ).rejects.toThrow();
  });
});

describe('SelfEncryptingMessage - Format Validation', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should validate correct message format', async () => {
    const plaintext = 'Valid message';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    expect(isSelfEncryptingMessage(encrypted)).toBe(true);

    const validation = validateEncryptedMessage(encrypted);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should detect invalid message format', () => {
    const invalidMessages = [
      {},
      { version: 'wrong-version' },
      { version: 'e2ee-v2' }, // Missing fields
      { version: 'e2ee-v2', iv: 'invalid', ciphertext: '', authTag: '', keys: {} },
      null,
      undefined,
      'string',
      123,
    ];

    for (const msg of invalidMessages) {
      expect(isSelfEncryptingMessage(msg)).toBe(false);
    }
  });

  it('should detect invalid IV length', async () => {
    const plaintext = 'Test';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Corrupt IV (wrong length)
    encrypted.iv = _sodium.to_base64(_sodium.randombytes_buf(16)); // Should be 12

    const validation = validateEncryptedMessage(encrypted);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/invalid iv length/i)])
    );
  });

  it('should detect invalid auth tag length', async () => {
    const plaintext = 'Test';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Corrupt auth tag (wrong length)
    encrypted.authTag = _sodium.to_base64(_sodium.randombytes_buf(32)); // Should be 16

    const validation = validateEncryptedMessage(encrypted);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/invalid auth tag length/i)])
    );
  });

  it('should detect missing participant keys', () => {
    const invalidMessage = {
      version: 'e2ee-v2' as const,
      type: 'standard' as const,
      iv: _sodium.to_base64(_sodium.randombytes_buf(12)),
      ciphertext: _sodium.to_base64(_sodium.randombytes_buf(32)),
      authTag: _sodium.to_base64(_sodium.randombytes_buf(16)),
      keys: {}, // Empty!
    };

    const validation = validateEncryptedMessage(invalidMessage);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/no participant keys/i)])
    );
  });
});

describe('SelfEncryptingMessage - Utility Functions', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should list message participants', async () => {
    const plaintext = 'Group message';
    const alice = await generateParticipant('alice-123');
    const bob = await generateParticipant('bob-456');
    const charlie = await generateParticipant('charlie-789');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant, bob.participant, charlie.participant],
      'standard'
    );

    const participants = getMessageParticipants(encrypted);
    expect(participants).toHaveLength(3);
    expect(participants).toContain('alice-123');
    expect(participants).toContain('bob-456');
    expect(participants).toContain('charlie-789');
  });

  it('should check if user can decrypt message', async () => {
    const plaintext = 'Test';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    expect(canUserDecryptMessage(encrypted, 'alice-123')).toBe(true);
    expect(canUserDecryptMessage(encrypted, 'bob-456')).toBe(false);
  });

  it('should estimate encrypted message size', () => {
    const testCases = [
      { plaintext: 'Short', participants: 1, expectedMin: 200 },
      { plaintext: 'A'.repeat(1000), participants: 1, expectedMin: 1200 },
      { plaintext: 'Test', participants: 5, expectedMin: 400 },
    ];

    for (const { plaintext, participants, expectedMin } of testCases) {
      const estimated = estimateEncryptedSize(plaintext, participants);
      expect(estimated).toBeGreaterThan(expectedMin);
    }
  });
});

describe('SelfEncryptingMessage - Error Handling', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should throw on empty participant list', async () => {
    await expect(
      encryptSelfEncryptingMessage('test', [], 'standard')
    ).rejects.toThrow();
  });

  it('should throw on decryption with unsupported version', async () => {
    const alice = await generateParticipant('alice-123');

    const invalidMessage = {
      version: 'e2ee-v3' as any,
      type: 'standard' as const,
      iv: 'test',
      ciphertext: 'test',
      authTag: 'test',
      keys: { 'alice-123': 'test' },
    };

    await expect(
      decryptSelfEncryptingMessage(
        invalidMessage,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      )
    ).rejects.toThrow(/unsupported message version/i);
  });

  it('should throw on malformed base64', async () => {
    const plaintext = 'Test';
    const alice = await generateParticipant('alice-123');

    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );

    // Corrupt base64
    encrypted.ciphertext = 'not-valid-base64!!!';

    await expect(
      decryptSelfEncryptingMessage(
        encrypted,
        'alice-123',
        alice.participant.publicKey,
        alice.privateKey
      )
    ).rejects.toThrow();
  });
});

describe('SelfEncryptingMessage - Performance', () => {
  beforeEach(async () => {
    await _sodium.ready;
  });

  it('should handle large messages efficiently', async () => {
    const plaintext = 'A'.repeat(50000); // 50 KB
    const alice = await generateParticipant('alice-123');

    const startEncrypt = performance.now();
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [alice.participant],
      'standard'
    );
    const encryptTime = performance.now() - startEncrypt;

    const startDecrypt = performance.now();
    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice-123',
      alice.participant.publicKey,
      alice.privateKey
    );
    const decryptTime = performance.now() - startDecrypt;

    expect(decrypted).toBe(plaintext);
    
    // Performance assertions (should be fast even for large messages)
    expect(encryptTime).toBeLessThan(500); // < 500ms
    expect(decryptTime).toBeLessThan(500); // < 500ms

    console.log(`Encrypted 50KB in ${encryptTime.toFixed(2)}ms`);
    console.log(`Decrypted 50KB in ${decryptTime.toFixed(2)}ms`);
  });

  it('should handle many participants efficiently', async () => {
    const plaintext = 'Group message';
    const participants = await Promise.all(
      Array.from({ length: 50 }, (_, i) => generateParticipant(`user-${i}`))
    );

    const startEncrypt = performance.now();
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      participants.map(p => p.participant),
      'standard'
    );
    const encryptTime = performance.now() - startEncrypt;

    expect(Object.keys(encrypted.keys)).toHaveLength(50);
    expect(encryptTime).toBeLessThan(1000); // < 1s for 50 participants

    console.log(`Encrypted for 50 participants in ${encryptTime.toFixed(2)}ms`);
  });
});
