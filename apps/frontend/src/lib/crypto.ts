import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export function sha256(data: Uint8Array): Uint8Array {
  return nacl.hash(data).slice(0, 32);
}

export function randomBytes(length: number): Uint8Array {
  return nacl.randomBytes(length);
}

// Note: TweetNaCl doesn't have box.seal, using regular box instead
export function encryptSealed(message: string, recipientPublicKey: Uint8Array): string {
  const messageUint8 = new TextEncoder().encode(message);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ephemeralKeyPair = nacl.box.keyPair();
  const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);
  
  // Combine ephemeral public key + nonce + ciphertext
  const combined = new Uint8Array(ephemeralKeyPair.publicKey.length + nonce.length + encrypted.length);
  combined.set(ephemeralKeyPair.publicKey, 0);
  combined.set(nonce, ephemeralKeyPair.publicKey.length);
  combined.set(encrypted, ephemeralKeyPair.publicKey.length + nonce.length);
  
  return encodeBase64(combined);
}

export function decryptSealed(ciphertext: string, _publicKey: Uint8Array, secretKey: Uint8Array): string {
  const combined = decodeBase64(ciphertext);
  
  // Extract components
  const ephemeralPublicKey = combined.slice(0, nacl.box.publicKeyLength);
  const nonce = combined.slice(nacl.box.publicKeyLength, nacl.box.publicKeyLength + nacl.box.nonceLength);
  const encrypted = combined.slice(nacl.box.publicKeyLength + nacl.box.nonceLength);
  
  const decrypted = nacl.box.open(encrypted, nonce, ephemeralPublicKey, secretKey);
  if (!decrypted) {
    throw new Error('Decryption failed');
  }
  return new TextDecoder().decode(decrypted);
}
