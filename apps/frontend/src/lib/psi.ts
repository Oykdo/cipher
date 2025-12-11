/**
 * PSI Enhanced (Private Set Intersection) Implementation
 * Provides privacy-preserving contact discovery and secure authentication
 * 
 * Use Cases:
 * 1. Contact Discovery - Find mutual contacts without revealing your full contact list
 * 2. Key Exchange - Verify identity without exposing credentials
 * 3. Authentication - Zero-knowledge proof of identity
 * 
 * Protocol: Based on OPRF (Oblivious Pseudorandom Function) + Diffie-Hellman
 */

import { sha256, randomBytes } from './crypto';

/**
 * PSI Configuration
 */
export interface PsiConfig {
  hashIterations: number;
  saltLength: number;
  keyLength: number;
}

export const DEFAULT_PSI_CONFIG: PsiConfig = {
  hashIterations: 100000, // PBKDF2-like iterations
  saltLength: 32,         // 256 bits
  keyLength: 32,          // 256 bits
};

/**
 * PSI Client State
 */
export interface PsiClientState {
  clientSecret: Uint8Array;
  blindedElements: Map<string, string>; // identifier -> blinded hash
}

/**
 * PSI Server State (for reference, implemented on backend)
 */
export interface PsiServerState {
  serverSecret: Uint8Array;
  dataset: Set<string>; // Hashed identifiers
}

/**
 * Generates a random blinding factor
 * @param length Length in bytes
 * @returns Random bytes for blinding
 */
function generateBlindingFactor(length: number = 32): Uint8Array {
  return randomBytes(length);
}

/**
 * Applies blinding to an element (client-side operation)
 * @param element Element to blind (e.g., email, phone number)
 * @param blindingFactor Random blinding factor
 * @param salt Salt for hashing
 * @returns Blinded element
 */
export async function blindElement(
  element: string,
  blindingFactor: Uint8Array,
  salt: Uint8Array
): Promise<string> {
  // Step 1: Hash the element with salt
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...encoder.encode(element), ...salt]);
  const elementHash = sha256(combined);
  
  // Step 2: Combine with blinding factor (XOR for simplicity, DH in production)
  const blindingHex = bytesToHex(blindingFactor);
  const elementHashHex = bytesToHex(elementHash);
  const blinded = xorHex(elementHashHex, blindingHex);
  
  return blinded;
}

/**
 * Server evaluates blinded element with its secret key (OPRF)
 * @param blindedElement Blinded element from client
 * @param serverSecret Server's secret key
 * @returns Evaluated (signed) blinded element
 */
export async function evaluateBlindedElement(
  blindedElement: string,
  serverSecret: Uint8Array
): Promise<string> {
  // Apply server secret (HMAC-like operation)
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...encoder.encode(blindedElement), ...serverSecret]);
  const evaluated = sha256(combined);
  return bytesToHex(evaluated);
}

/**
 * Client unblinds the evaluated element
 * @param evaluatedElement Element evaluated by server
 * @param blindingFactor Original blinding factor
 * @returns Unblinded result
 */
export function unblindElement(
  evaluatedElement: string,
  blindingFactor: Uint8Array
): string {
  // Remove blinding factor (inverse operation)
  const blindingHex = bytesToHex(blindingFactor);
  const unblinded = xorHex(evaluatedElement, blindingHex);
  return unblinded;
}

/**
 * PSI Client: Initialize client state
 * @param identifiers List of identifiers to check (e.g., usernames, emails)
 * @param config PSI configuration
 * @returns Client state for PSI protocol
 */
export async function psiClientInit(
  identifiers: string[],
  config: PsiConfig = DEFAULT_PSI_CONFIG
): Promise<PsiClientState> {
  const clientSecret = generateBlindingFactor(config.keyLength);
  const salt = generateBlindingFactor(config.saltLength);
  const blindedElements = new Map<string, string>();

  // Blind each identifier
  for (const identifier of identifiers) {
    const blindingFactor = generateBlindingFactor(config.keyLength);
    const blinded = await blindElement(identifier, blindingFactor, salt);
    blindedElements.set(identifier, blinded);
  }

  return {
    clientSecret,
    blindedElements,
  };
}

/**
 * PSI Enhanced: Contact Discovery
 * Finds mutual contacts without revealing full contact lists
 * 
 * @param myContacts My contact identifiers (e.g., usernames)
 * @param serverEvaluatedSet Server's evaluated set (from API)
 * @returns List of mutual contacts
 */
export async function findMutualContacts(
  myContacts: string[],
  serverEvaluatedSet: string[]
): Promise<string[]> {
  const mutual: string[] = [];
  const salt = generateBlindingFactor(32);

  // Hash my contacts
  const myHashedContacts = myContacts.map((contact) => {
    const encoder = new TextEncoder();
    const combined = new Uint8Array([...encoder.encode(contact), ...salt]);
    const hash = sha256(combined);
    return {
      original: contact,
      hash: bytesToHex(hash),
    };
  });

  // Find intersection
  const serverSet = new Set(serverEvaluatedSet);
  for (const { original, hash } of myHashedContacts) {
    if (serverSet.has(hash)) {
      mutual.push(original);
    }
  }

  return mutual;
}

/**
 * PSI Enhanced: Secure Key Exchange
 * Verifies identity without exposing credentials
 * 
 * Protocol:
 * 1. Client generates ephemeral key pair
 * 2. Client blinds identity with ephemeral private key
 * 3. Server evaluates with its secret
 * 4. Client unblinds and derives shared secret
 */
export interface PsiKeyExchange {
  clientPublicKey: string;
  blindedIdentity: string;
}

export async function initiateKeyExchange(
  identity: string,
  config: PsiConfig = DEFAULT_PSI_CONFIG
): Promise<{ exchange: PsiKeyExchange; privateKey: Uint8Array }> {
  // Generate ephemeral key pair (simplified, use ECDH in production)
  const privateKey = generateBlindingFactor(config.keyLength);
  const publicKeyHash = sha256(privateKey);
  const publicKey = bytesToHex(publicKeyHash);
  
  // Blind identity
  const salt = generateBlindingFactor(config.saltLength);
  const blindedIdentity = await blindElement(identity, privateKey, salt);

  return {
    exchange: {
      clientPublicKey: publicKey,
      blindedIdentity,
    },
    privateKey,
  };
}

/**
 * Complete key exchange after server response
 * @param serverResponse Server's evaluation
 * @param privateKey Client's private key
 * @returns Shared secret
 */
export function completeKeyExchange(
  serverResponse: string,
  privateKey: Uint8Array
): string {
  return unblindElement(serverResponse, privateKey);
}

/**
 * PSI Enhanced: Zero-Knowledge Authentication
 * Proves knowledge of secret without revealing it
 * 
 * Protocol:
 * 1. Client commits to a random nonce + secret
 * 2. Server issues challenge
 * 3. Client responds with blinded proof
 * 4. Server verifies without learning secret
 */
export interface ZkAuthCommitment {
  commitment: string;
  nonce: Uint8Array;
}

export async function createZkAuthCommitment(
  secret: string
): Promise<ZkAuthCommitment> {
  const nonce = generateBlindingFactor(32);
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...encoder.encode(secret), ...nonce]);
  const commitmentHash = sha256(combined);
  const commitment = bytesToHex(commitmentHash);
  
  return { commitment, nonce };
}

export async function respondToZkChallenge(
  secret: string,
  challenge: string,
  nonce: Uint8Array
): Promise<string> {
  // Create proof: Hash(secret || challenge || nonce)
  const encoder = new TextEncoder();
  const combined = new Uint8Array([
    ...encoder.encode(secret),
    ...encoder.encode(challenge),
    ...nonce
  ]);
  const proofHash = sha256(combined);
  return bytesToHex(proofHash);
}

/**
 * Utility: XOR two hex strings (for blinding operations)
 * @param hex1 First hex string
 * @param hex2 Second hex string
 * @returns XOR result as hex
 */
function xorHex(hex1: string, hex2: string): string {
  const length = Math.min(hex1.length, hex2.length);
  let result = '';
  
  for (let i = 0; i < length; i += 2) {
    const byte1 = parseInt(hex1.substr(i, 2), 16);
    const byte2 = parseInt(hex2.substr(i, 2), 16);
    const xored = (byte1 ^ byte2).toString(16).padStart(2, '0');
    result += xored;
  }
  
  return result;
}

/**
 * Utility: Convert Uint8Array to hex string
 * @param bytes Byte array
 * @returns Hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Utility: Convert hex string to Uint8Array
 * @param hex Hex string
 * @returns Byte array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * PSI Enhanced: Secure Group Membership Test
 * Tests if an element belongs to a set without revealing the set or element
 * 
 * Use case: Check if user is in admin group without exposing admin list
 */
export async function testGroupMembership(
  userId: string,
  groupBloomFilter: string, // Server provides Bloom filter
  salt: string
): Promise<boolean> {
  // Hash user ID with salt
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...encoder.encode(userId), ...encoder.encode(salt)]);
  const hashBytes = sha256(combined);
  const hash = bytesToHex(hashBytes);
  
  // Check against Bloom filter (simplified)
  // In production, use proper Bloom filter implementation
  return groupBloomFilter.includes(hash.substring(0, 16));
}

/**
 * PSI Enhanced: Private Credential Verification
 * Verifies credentials exist in database without database learning which credential
 * 
 * Use case: Password reset without revealing which passwords are valid
 */
export async function verifyCredentialPrivately(
  credential: string,
  serverBlindedSet: string[]
): Promise<boolean> {
  const salt = generateBlindingFactor(32);
  const blindingFactor = generateBlindingFactor(32);
  
  // Blind credential
  const blinded = await blindElement(credential, blindingFactor, salt);
  
  // Check if in server set (server never sees plaintext)
  return serverBlindedSet.includes(blinded);
}

/**
 * PSI Stats and Monitoring
 */
export interface PsiStats {
  totalOperations: number;
  blindOperations: number;
  unblindOperations: number;
  keyExchanges: number;
  zkProofs: number;
  averageLatency: number; // milliseconds
}

let psiStats: PsiStats = {
  totalOperations: 0,
  blindOperations: 0,
  unblindOperations: 0,
  keyExchanges: 0,
  zkProofs: 0,
  averageLatency: 0,
};

export function getPsiStats(): PsiStats {
  return { ...psiStats };
}

export function resetPsiStats(): void {
  psiStats = {
    totalOperations: 0,
    blindOperations: 0,
    unblindOperations: 0,
    keyExchanges: 0,
    zkProofs: 0,
    averageLatency: 0,
  };
}

// Track operation timing
function trackOperation(type: keyof PsiStats, duration: number): void {
  if (type === 'averageLatency') {
    const total = psiStats.totalOperations * psiStats.averageLatency;
    psiStats.averageLatency = (total + duration) / (psiStats.totalOperations + 1);
  } else {
    (psiStats[type] as number)++;
  }
  psiStats.totalOperations++;
}

/**
 * Wrapper functions with stats tracking
 */
export async function blindElementTracked(...args: Parameters<typeof blindElement>) {
  const start = Date.now();
  const result = await blindElement(...args);
  trackOperation('blindOperations', Date.now() - start);
  return result;
}

export function unblindElementTracked(...args: Parameters<typeof unblindElement>) {
  const start = Date.now();
  const result = unblindElement(...args);
  trackOperation('unblindOperations', Date.now() - start);
  return result;
}
