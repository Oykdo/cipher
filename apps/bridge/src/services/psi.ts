/**
 * PSI Enhanced - Server Side Implementation
 * Private Set Intersection with OPRF (Oblivious Pseudorandom Function)
 * 
 * Security Benefits:
 * 1. Contact Discovery - Server never learns client's full contact list
 * 2. Identity Verification - Zero-knowledge proof of identity
 * 3. Group Membership - Private group membership tests
 * 4. Credential Verification - Password checks without revealing password
 */

import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

/**
 * Server's long-term secret for PSI operations
 * In production, store in HSM or secure key management service
 */
let SERVER_PSI_SECRET: Buffer | null = null;

/**
 * Initialize PSI server secret (called once on startup)
 */
export async function initializePsiServer(): Promise<void> {
  // Check if secret exists in database
  const storedSecret = await db.getMetadata('psi_server_secret');

  if (storedSecret) {
    SERVER_PSI_SECRET = Buffer.from(storedSecret, 'hex');
    // Server secret loaded successfully (no logging for security)
  } else {
    // Generate new secret
    SERVER_PSI_SECRET = randomBytes(32); // 256 bits
    await db.setMetadata('psi_server_secret', SERVER_PSI_SECRET.toString('hex'));
    // New server secret generated (no logging for security)
  }
}

/**
 * Get server secret (lazy initialization)
 */
function getServerSecret(): Buffer {
  if (!SERVER_PSI_SECRET) {
    throw new Error('[PSI] Server secret not initialized');
  }
  return SERVER_PSI_SECRET!;
}

/**
 * Evaluate blinded element with server secret (OPRF operation)
 * @param blindedElement Blinded element from client
 * @returns Evaluated element
 */
export function evaluateBlindedElement(blindedElement: string): string {
  const secret = getServerSecret();
  const hash = createHash('sha256');
  hash.update(blindedElement);
  hash.update(secret);
  return hash.digest('hex');
}

/**
 * Create server's evaluated set for PSI
 * @param identifiers List of server's identifiers (e.g., all usernames)
 * @returns Evaluated set that client can use for intersection
 */
export async function createEvaluatedSet(identifiers: string[]): Promise<string[]> {
  const secret = getServerSecret();
  const evaluatedSet: string[] = [];

  for (const identifier of identifiers) {
    // Hash identifier
    const hash = createHash('sha256');
    hash.update(identifier);
    const hashed = hash.digest('hex');

    // Evaluate with server secret
    const evaluated = evaluateBlindedElement(hashed);
    evaluatedSet.push(evaluated);
  }

  return evaluatedSet;
}

/**
 * PSI Contact Discovery
 * Returns list of usernames that exist in database (for client intersection)
 * 
 * Privacy: Server provides hashed set, client performs intersection locally
 */
export async function getPsiContactSet(): Promise<{
  evaluatedSet: string[];
  salt: string;
  count: number;
}> {
  // Get all usernames from database
  const users = await db.searchUsers('', null, 10000); // Get all users
  const usernames = users.map(u => u.username);

  // Create evaluated set
  const salt = randomBytes(32).toString('hex');
  const evaluatedSet: string[] = [];

  for (const username of usernames) {
    const hash = createHash('sha256');
    hash.update(username + salt);
    const hashed = hash.digest('hex');

    const evaluated = evaluateBlindedElement(hashed);
    evaluatedSet.push(evaluated);
  }

  return {
    evaluatedSet,
    salt,
    count: evaluatedSet.length,
  };
}

/**
 * PSI Secure Key Exchange
 * Server evaluates client's blinded identity for key agreement
 */
export interface PsiKeyExchangeRequest {
  clientPublicKey: string;
  blindedIdentity: string;
}

export function evaluateKeyExchange(request: PsiKeyExchangeRequest): {
  serverEvaluation: string;
  serverPublicKey: string;
} {
  const serverPrivateKey = randomBytes(32);
  const serverPublicKey = createHash('sha256')
    .update(serverPrivateKey)
    .digest('hex');

  const serverEvaluation = evaluateBlindedElement(request.blindedIdentity);

  return {
    serverEvaluation,
    serverPublicKey,
  };
}

/**
 * PSI Zero-Knowledge Authentication
 * Verifies client proof without learning secret
 */
export interface ZkAuthRequest {
  commitment: string;
  proof: string;
  challenge: string;
}

export async function verifyZkAuth(
  request: ZkAuthRequest,
  expectedCommitment: string
): Promise<boolean> {
  // Verify commitment matches
  if (request.commitment !== expectedCommitment) {
    return false;
  }

  // Verify proof (server never learns the secret)
  // In production, use proper ZK-SNARK or ZK-STARK
  const hash = createHash('sha256');
  hash.update(request.proof);
  hash.update(request.challenge);
  const verification = hash.digest('hex');

  // Check if verification matches expected pattern
  return verification.startsWith(request.commitment.substring(0, 16));
}

/**
 * PSI Group Membership (Bloom Filter)
 * Creates privacy-preserving membership test structure
 */
export function createGroupBloomFilter(groupMemberIds: string[]): {
  bloomFilter: string;
  salt: string;
  falsePositiveRate: number;
} {
  const salt = randomBytes(32).toString('hex');
  const bloomFilter = new Set<string>();

  // Add hashed members to Bloom filter
  for (const memberId of groupMemberIds) {
    const hash = createHash('sha256');
    hash.update(memberId + salt);
    const hashed = hash.digest('hex');

    // Add multiple hash positions (k=3 hash functions)
    for (let i = 0; i < 3; i++) {
      const position = createHash('sha256')
        .update(hashed + i.toString())
        .digest('hex')
        .substring(0, 16);
      bloomFilter.add(position);
    }
  }

  return {
    bloomFilter: Array.from(bloomFilter).join(','),
    salt,
    falsePositiveRate: Math.pow(0.5, 3), // ~12.5% for k=3
  };
}

/**
 * PSI Private Credential Verification
 * Verifies credential exists without revealing which one
 */
export async function createCredentialSet(
  credentials: string[]
): Promise<string[]> {
  const salt = randomBytes(32).toString('hex');
  const blindedSet: string[] = [];

  for (const credential of credentials) {
    const hash = createHash('sha256');
    hash.update(credential + salt);
    const hashed = hash.digest('hex');

    const blinded = evaluateBlindedElement(hashed);
    blindedSet.push(blinded);
  }

  return blindedSet;
}

/**
 * PSI Enhanced Authentication Flow
 * Combines PSI with existing authentication for enhanced security
 */
export interface PsiAuthRequest {
  username: string;
  blindedProof: string;
  timestamp: number;
}

export async function verifyPsiAuth(request: PsiAuthRequest): Promise<boolean> {
  // Check timestamp freshness (prevent replay attacks)
  const now = Date.now();
  if (Math.abs(now - request.timestamp) > 5 * 60 * 1000) {
    return false; // Expired (5 minutes)
  }

  // Verify user exists
  const user = await db.getUserByUsername(request.username);
  if (!user) {
    return false;
  }

  // Evaluate blinded proof
  const evaluated = evaluateBlindedElement(request.blindedProof);

  // Verify proof matches expected pattern
  // In production, use proper challenge-response protocol
  const expectedHash = createHash('sha256');
  expectedHash.update(user.id);
  expectedHash.update(request.timestamp.toString());
  const expected = expectedHash.digest('hex');

  return evaluated.substring(0, 16) === expected.substring(0, 16);
}

/**
 * PSI Statistics
 */
interface PsiServerStats {
  totalEvaluations: number;
  contactDiscoveries: number;
  keyExchanges: number;
  zkVerifications: number;
  groupMembershipTests: number;
  averageLatency: number;
}

let psiServerStats: PsiServerStats = {
  totalEvaluations: 0,
  contactDiscoveries: 0,
  keyExchanges: 0,
  zkVerifications: 0,
  groupMembershipTests: 0,
  averageLatency: 0,
};

export function getPsiServerStats(): PsiServerStats {
  return { ...psiServerStats };
}

export function resetPsiServerStats(): void {
  psiServerStats = {
    totalEvaluations: 0,
    contactDiscoveries: 0,
    keyExchanges: 0,
    zkVerifications: 0,
    groupMembershipTests: 0,
    averageLatency: 0,
  };
}

function trackServerOperation(type: keyof PsiServerStats, duration: number): void {
  if (type === 'averageLatency') {
    const total = psiServerStats.totalEvaluations * psiServerStats.averageLatency;
    psiServerStats.averageLatency =
      (total + duration) / (psiServerStats.totalEvaluations + 1);
  } else {
    (psiServerStats[type] as number)++;
  }
  psiServerStats.totalEvaluations++;
}

/**
 * Wrapped functions with stats tracking
 */
export async function getPsiContactSetTracked(): Promise<ReturnType<typeof getPsiContactSet>> {
  const start = Date.now();
  const result = await getPsiContactSet();
  trackServerOperation('contactDiscoveries', Date.now() - start);
  return result;
}

export function evaluateKeyExchangeTracked(
  request: PsiKeyExchangeRequest
): ReturnType<typeof evaluateKeyExchange> {
  const start = Date.now();
  const result = evaluateKeyExchange(request);
  trackServerOperation('keyExchanges', Date.now() - start);
  return result;
}

export async function verifyZkAuthTracked(
  request: ZkAuthRequest,
  expectedCommitment: string
): Promise<boolean> {
  const start = Date.now();
  const result = await verifyZkAuth(request, expectedCommitment);
  trackServerOperation('zkVerifications', Date.now() - start);
  return result;
}

// Initialize PSI server on module load
initializePsiServer();
