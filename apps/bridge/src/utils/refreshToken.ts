/**
 * Refresh Token Utilities
 * Manages JWT refresh tokens for secure session management
 */

import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

// Refresh token configuration
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Generates a cryptographically secure refresh token
 * @returns Raw token string (64 hex characters)
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hashes a refresh token using SHA-256
 * @param token Raw refresh token
 * @returns SHA-256 hash of the token
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new refresh token for a user
 * @param userId User ID
 * @param userAgent Optional user agent string
 * @param ipAddress Optional IP address
 * @returns Object with token ID and raw token
 */
export async function createRefreshToken(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ id: string; token: string }> {
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const id = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + REFRESH_TOKEN_EXPIRY;

  db.createRefreshToken({
    id,
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: userAgent,
    ip_address: ipAddress,
  });

  return { id, token };
}

/**
 * Validates a refresh token
 * @param token Raw refresh token
 * @returns Token data if valid, null otherwise
 */
export async function validateRefreshToken(token: string): Promise<{
  id: string;
  user_id: string;
} | null> {
  const tokenHash = hashRefreshToken(token);
  const tokenData = await db.getRefreshTokenByHash(tokenHash);

  if (!tokenData) {
    return null;
  }

  // Check if expired (double-check, already filtered in query)
  if (tokenData.expires_at < Date.now()) {
    return null;
  }

  // Check if revoked
  if (tokenData.revoked === 1) {
    return null;
  }

  // Update last used timestamp
  await db.updateRefreshTokenLastUsed(tokenData.id);

  return {
    id: tokenData.id,
    user_id: tokenData.user_id,
  };
}

/**
 * Revokes a specific refresh token
 * @param tokenId Token ID to revoke
 */
export function revokeRefreshToken(tokenId: string): void {
  db.revokeRefreshToken(tokenId);
}

/**
 * Revokes all refresh tokens for a user (logout all devices)
 * @param userId User ID
 */
export function revokeAllUserTokens(userId: string): void {
  db.revokeAllUserRefreshTokens(userId);
}

/**
 * Cleanup expired and revoked tokens (run periodically)
 * @returns Number of tokens cleaned up
 */
export async function cleanupExpiredTokens(): Promise<number> {
  return await db.cleanupExpiredRefreshTokens();
}

// Schedule automatic cleanup every hour
setInterval(async () => {
  const cleaned = await cleanupExpiredTokens();
  if (cleaned > 0) {
    console.log(`[RefreshToken] Cleaned up ${cleaned} expired/revoked tokens`);
  }
}, 60 * 60 * 1000); // 1 hour
