# End-to-End Encryption (E2EE) Implementation

## Overview

Project Chimera now includes a comprehensive End-to-End Encryption (E2EE) system built on industry-standard cryptographic primitives using **libsodium**.

## Architecture

### Cryptographic Primitives

- **Key Exchange**: X25519 (Elliptic Curve Diffie-Hellman)
- **Symmetric Encryption**: ChaCha20-Poly1305 (authenticated encryption)
- **Digital Signatures**: Ed25519
- **Key Derivation**: BLAKE2b (via libsodium's generic hash)
- **Hashing**: SHA-256 (for fingerprints)

### Key Types

1. **Identity Keys** (Long-term)
   - X25519 key pair for key exchange
   - Ed25519 key pair for signing
   - Stored securely in KeyVault (IndexedDB encrypted)
   - Used to establish sessions with peers

2. **Session Keys** (Per-conversation)
   - Derived from X25519 key exchange
   - Used for actual message encryption
   - Cached in memory for performance
   - Stored encrypted in KeyVault for persistence

3. **Prekeys** (One-time use)
   - For asynchronous messaging (X3DH-like)
   - Generated in batches of 100
   - Consumed when establishing new sessions

## Security Features

### Perfect Forward Secrecy (PFS)

Each conversation uses ephemeral session keys derived from the identity keys. Even if identity keys are compromised, past messages remain secure.

### Key Fingerprinting

Each identity key has a unique fingerprint (SHA-256 hash formatted as hex groups):
```
A1B2 C3D4 E5F6 G7H8 I9J0 K1L2 M3N4 O5P6
Q7R8 S9T0 U1V2 W3X4 Y5Z6 A7B8 C9D0 E1F2
```

Users can verify fingerprints through:
- QR code scanning
- Manual comparison (in-person, video call, phone)
- Out-of-band verification

### Authenticated Encryption

All messages use ChaCha20-Poly1305, which provides:
- Confidentiality (encryption)
- Integrity (authentication tag)
- Protection against tampering

### Metadata Protection

While the current implementation focuses on message content encryption, future enhancements will include:
- Message padding (to hide length)
- Timing obfuscation
- Dummy traffic

## Implementation Details

### Module Structure

```
apps/frontend/src/lib/e2ee/
├── index.ts                    # Core crypto primitives
├── keyManagement.ts            # Key generation and storage
├── sessionManager.ts           # Session establishment and management
├── e2eeService.ts             # High-level API
└── messagingIntegration.ts    # Integration with messaging system
```

### Key Storage

Keys are stored in the KeyVault (encrypted IndexedDB):

```typescript
// Identity keys
e2ee:identity:{username} -> {
  identityPublicKey: string,
  identityPrivateKey: string,
  identityFingerprint: string,
  signingPublicKey: string,
  signingPrivateKey: string,
  ...
}

// Peer keys
e2ee:peer:{username}:{peerUsername} -> {
  publicKey: string,
  fingerprint: string,
  verifiedAt: number | null
}

// Sessions
e2ee:session:{username}:{peerUsername} -> {
  sessionId: string,
  sharedSecret: string,
  encryptionKey: string,
  createdAt: number,
  messageCounter: number
}
```

### Message Format

E2EE messages are wrapped in an envelope:

```json
{
  "version": "e2ee-v1",
  "encrypted": {
    "ciphertext": "base64...",
    "nonce": "base64..."
  }
}
```

Legacy messages (using the old encryption) are automatically detected and decrypted with the fallback mechanism.

## Usage

### Initialization

E2EE is automatically initialized on login:

```typescript
// In authStore.setSession()
await initializeE2EE(session.user.username);
```

### Sending Messages

```typescript
import { encryptMessageForSending } from '@/lib/e2ee/messagingIntegration';

const encryptedBody = await encryptMessageForSending(
  recipientUsername,
  plaintextMessage,
  legacyEncryptFn // Optional fallback
);

// Send encryptedBody to server
```

### Receiving Messages

```typescript
import { decryptReceivedMessage } from '@/lib/e2ee/messagingIntegration';

const plaintext = await decryptReceivedMessage(
  senderUsername,
  encryptedBody,
  legacyDecryptFn // Optional fallback
);
```

### Key Verification

```typescript
import { KeyVerification } from '@/components/e2ee/KeyVerification';

<KeyVerification
  peerUsername="alice"
  onVerified={() => console.log('Key verified!')}
/>
```

## UI Components

### FingerprintDisplay

Displays a user's key fingerprint with QR code:

```tsx
<FingerprintDisplay
  fingerprint={fingerprint}
  username={username}
  showQR={true}
/>
```

### KeyVerification

Full key verification flow with manual comparison:

```tsx
<KeyVerification
  peerUsername="bob"
  onVerified={handleVerified}
  onClose={handleClose}
/>
```

### MyKeyFingerprint

Shows the current user's fingerprint:

```tsx
<MyKeyFingerprint />
```

## API Reference

See individual module files for detailed API documentation:
- `apps/frontend/src/lib/e2ee/index.ts` - Core primitives
- `apps/frontend/src/lib/e2ee/e2eeService.ts` - High-level API

## Security Considerations

### Key Management

1. **Identity Keys**
   - Generated once per user
   - Stored encrypted in KeyVault
   - Never transmitted to server
   - Backed up with password encryption

2. **Session Keys**
   - Derived from identity keys via X25519 ECDH
   - Unique per conversation
   - Rotated on session deletion

3. **Key Verification**
   - CRITICAL: Users MUST verify fingerprints out-of-band
   - Unverified keys show warning indicators
   - Verification status persisted in KeyVault

### Threat Model

**Protected Against:**
- Server compromise (messages encrypted client-side)
- Network eavesdropping (E2EE + TLS)
- Message tampering (authenticated encryption)
- Replay attacks (nonces, message counters)

**NOT Protected Against:**
- Compromised client device
- Malicious client code injection
- Metadata analysis (who talks to whom, when)
- Endpoint security (keyloggers, screen capture)

### Best Practices

1. **For Users:**
   - Always verify key fingerprints with new contacts
   - Use strong master passwords
   - Keep backup of identity keys secure
   - Log out on shared devices

2. **For Developers:**
   - Never log decrypted messages
   - Wipe sensitive data from memory when done
   - Use constant-time comparisons for keys
   - Validate all inputs before decryption
   - Handle errors without leaking information

## Future Enhancements

### Planned Features

1. **Double Ratchet Protocol**
   - Integrate with existing DoubleRatchet implementation
   - Automatic key rotation per message
   - Enhanced forward secrecy

2. **Multi-Device Support**
   - Sync identity keys across devices
   - Device-specific session keys
   - Device verification

3. **Group Messaging**
   - Sender keys for efficient group encryption
   - Member key management
   - Group key rotation

4. **Advanced Metadata Protection**
   - Message padding to hide length
   - Dummy traffic generation
   - Timing obfuscation

5. **Key Backup & Recovery**
   - Shamir Secret Sharing
   - Social recovery
   - Encrypted cloud backup

### Potential Improvements

- **MLS (Messaging Layer Security)** for scalable group encryption
- **PQXDH** for post-quantum key exchange
- **Sealed Sender** to hide sender identity from server
- **Disappearing Messages** with cryptographic enforcement

## Testing

### Unit Tests

```bash
cd apps/frontend
npm test -- e2ee
```

### Integration Tests

Test key exchange and message encryption:

```typescript
// Example test
import { initializeE2EE, encryptMessageForPeer, decryptMessageFromPeer } from '@/lib/e2ee/e2eeService';

// Initialize for two users
await initializeE2EE('alice');
const aliceKeys = await getOrCreateIdentityKeys('alice');

await initializeE2EE('bob');
const bobKeys = await getOrCreateIdentityKeys('bob');

// Exchange keys
await addPeerPublicKey('bob', bytesToBase64(aliceKeys.identityKeyPair.publicKey), aliceKeys.identityKeyPair.fingerprint);
await addPeerPublicKey('alice', bytesToBase64(bobKeys.identityKeyPair.publicKey), bobKeys.identityKeyPair.fingerprint);

// Encrypt and decrypt
const encrypted = await encryptMessageForPeer('bob', 'Hello Bob!');
const decrypted = await decryptMessageFromPeer('alice', encrypted);

expect(decrypted).toBe('Hello Bob!');
```

## Troubleshooting

### Common Issues

**E2EE not initialized**
- Ensure user is logged in
- Check KeyVault is initialized
- Verify libsodium loaded successfully

**Decryption failed**
- Check peer's public key is stored
- Verify message format is correct
- Ensure session exists for peer

**Key verification fails**
- Fingerprints must match exactly
- Check for typos in manual entry
- Ensure QR code scanned correctly

### Debug Logging

Enable E2EE debug logs:

```typescript
// In browser console
localStorage.setItem('debug', 'e2ee:*');
```

## References

- [libsodium Documentation](https://doc.libsodium.org/)
- [Signal Protocol](https://signal.org/docs/)
- [X3DH Key Agreement](https://signal.org/docs/specifications/x3dh/)
- [Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [MLS Protocol](https://messaginglayersecurity.rocks/)

