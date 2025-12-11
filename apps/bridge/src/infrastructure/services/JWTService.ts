/**
 * JWT Service - Infrastructure Layer
 * 
 * Gère la génération et validation des JWT tokens
 */

import type { FastifyInstance } from 'fastify';
import { createRefreshToken as createRefreshTokenUtil, validateRefreshToken as validateRefreshTokenUtil, revokeRefreshToken as revokeRefreshTokenUtil } from '../../utils/refreshToken';
import type { DatabaseService } from '../../db/database';

export interface JWTPayload {
  userId: string;
}

export class JWTService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly db: DatabaseService
  ) {}

  /**
   * Generate access token (short-lived, 1 hour)
   */
  generateAccessToken(userId: string): string {
    // Fastify JWT uses 'any' for payload, so we can pass our custom structure
    return this.app.jwt.sign({ id: userId } as any, { expiresIn: '1h' });
  }

  /**
   * Generate refresh token (long-lived, 30 days)
   */
  async generateRefreshToken(userId: string): Promise<string> {
    // createRefreshTokenUtil returns { id, token }
    const { token } = await createRefreshTokenUtil(userId);
    return token;
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = this.app.jwt.verify(token) as any;
      return { userId: decoded.id };
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<JWTPayload> {
    const data = await validateRefreshTokenUtil(token);
    if (!data) {
      throw new Error('Invalid refresh token');
    }
    return { userId: data.user_id };
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    revokeRefreshTokenUtil(token);
  }

  /**
   * Revoke all user tokens
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    this.db.revokeAllUserRefreshTokens(userId);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    // Verify and get user ID
    const { userId } = await this.verifyRefreshToken(refreshToken);

    // Generate new tokens
    const newAccessToken = this.generateAccessToken(userId);
    const newRefreshToken = await this.generateRefreshToken(userId);

    // Revoke old refresh token
    await this.revokeRefreshToken(refreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}
