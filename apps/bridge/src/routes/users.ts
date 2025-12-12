/**
 * Users Routes - Search and status
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

// User status types
export type UserStatus = 'online' | 'busy' | 'away' | 'invisible';

interface OnlineUser {
  userId: string;
  username: string;
  socketId: string;
  lastSeen: number;
  status: UserStatus;
}

// In-memory store for online users
const onlineUsers = new Map<string, OnlineUser>();

export function getUserOnlineStatus(userId: string): { online: boolean; status?: UserStatus; lastSeen?: number } {
  const user = onlineUsers.get(userId);
  if (user) {
    // If user is invisible, report as offline to others
    if (user.status === 'invisible') {
      return { online: false };
    }
    return { online: true, status: user.status, lastSeen: user.lastSeen };
  }
  return { online: false };
}

export function getUserStatus(userId: string): UserStatus | null {
  const user = onlineUsers.get(userId);
  return user?.status || null;
}

export function setUserOnline(userId: string, username: string, socketId: string, status: UserStatus = 'online'): void {
  onlineUsers.set(userId, {
    userId,
    username,
    socketId,
    lastSeen: Date.now(),
    status,
  });
}

export function setUserStatus(userId: string, status: UserStatus): boolean {
  const user = onlineUsers.get(userId);
  if (user) {
    user.status = status;
    user.lastSeen = Date.now();
    return true;
  }
  return false;
}

export function setUserOffline(userId: string): void {
  onlineUsers.delete(userId);
}

export function getAllOnlineUsers(): string[] {
  return Array.from(onlineUsers.values())
    .filter(u => u.status !== 'invisible')
    .map(u => u.userId);
}

export function getOnlineUserData(userId: string): OnlineUser | undefined {
  return onlineUsers.get(userId);
}

export async function usersRoutes(fastify: FastifyInstance) {

  /**
   * Get current user profile
   * GET /api/v2/users/me
   */
  fastify.get(
    '/api/v2/users/me',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        const user = await db.getUserById(userId);

        if (!user) {
          reply.code(404);
          return { error: 'User not found' };
        }

        // Determine key length from mnemonic ciphertext length for standard accounts
        let keyBits = 256; // Default
        if (user.security_tier === 'standard' && user.mnemonic) {
          try {
            // Check if it's the encrypted JSON format
            if (user.mnemonic.startsWith('{')) {
              const mnemonicData = JSON.parse(user.mnemonic);
              if (mnemonicData && typeof mnemonicData.ct === 'string') {
                // Estimate based on ciphertext length (Base64)
                // 12 words (128 bits) -> ~100-160 chars Base64
                // 24 words (256 bits) -> ~200-300 chars Base64
                // Threshold set to 180 to separate them
                keyBits = mnemonicData.ct.length < 180 ? 128 : 256;
              }
            } else {
              // Legacy plaintext format (array of strings)
              const words = JSON.parse(user.mnemonic);
              if (Array.isArray(words)) {
                 keyBits = words.length === 12 ? 128 : 256;
              }
            }
          } catch (e) {
            // Default to 256 on error
            keyBits = 256;
          }
        } else if (user.security_tier === 'dice-key') {
          keyBits = 775; // DiceKey entropy
        }

        return {
          id: user.id,
          username: user.username,
          securityTier: user.security_tier || 'standard',
          keyBits,
          createdAt: user.created_at,
          avatarHash: user.avatar_hash || null,
        };
      } catch (error: any) {
        fastify.log.error({ error }, 'Failed to get user profile');
        reply.code(500);
        return { error: 'Internal server error' };
      }
    }
  );

  /**
   * Get current user's discoverable status
   * GET /api/v2/users/me/discoverable
   */
  fastify.get(
    '/api/v2/users/me/discoverable',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        const discoverable = await db.getUserDiscoverable(userId);

        return { discoverable };
      } catch (error: any) {
        fastify.log.error({ error }, 'Get discoverable failed');
        reply.code(500);
        return { error: 'Failed to get discoverable status' };
      }
    }
  );

  /**
   * Update current user's discoverable status
   * PUT /api/v2/users/me/discoverable
   */
  fastify.put<{
    Body: { discoverable: boolean };
  }>(
    '/api/v2/users/me/discoverable',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        const { discoverable } = request.body;

        if (typeof discoverable !== 'boolean') {
          reply.code(400);
          return { error: 'discoverable must be a boolean' };
        }

        db.updateUserDiscoverable(userId, discoverable);

        fastify.log.info({
          userId,
          discoverable,
        }, 'User discoverable status updated');

        return {
          success: true,
          discoverable
        };
      } catch (error: any) {
        fastify.log.error({ error }, 'Update discoverable failed');
        reply.code(500);
        return { error: 'Failed to update discoverable status' };
      }
    }
  );

  /**
   * Search users by username
   * GET /api/v2/users/search?q=username
   */
  fastify.get<{
    Querystring: { q: string };
  }>(
    '/api/v2/users/search',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { q } = request.query;

      if (!q || q.length < 2) {
        reply.code(400);
        return { error: 'Query must be at least 2 characters' };
      }

      try {
        // Get current user ID from JWT
        const currentUserId = request.user.sub;

        // Search users in database (excluding current user)
        const users = await db.searchUsers(q, currentUserId, 50); // ✅ Added await, limit is a number

        // Add online status to each user
        const usersWithStatus = users.map(user => ({
          id: user.id,
          username: user.username,
          securityTier: (user as any).security_tier,
          online: onlineUsers.has(user.id),
          lastSeen: onlineUsers.get(user.id)?.lastSeen,
        }));

        return {
          users: usersWithStatus,
          total: usersWithStatus.length,
        };
      } catch (error: any) {
        fastify.log.error({ error }, 'User search failed');
        reply.code(500);
        return { error: 'Search failed' };
      }
    }
  );

  /**
   * Get user by username
   * GET /api/v2/users/:username
   */
  fastify.get<{
    Params: { username: string };
  }>(
    '/api/v2/users/:username',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { username } = request.params;

      try {
        const user = await db.getUserByUsername(username);

        if (!user) {
          reply.code(404);
          return { error: 'User not found' };
        }

        // Don't return sensitive data
        const safeUser = {
          id: user.id,
          username: user.username,
          securityTier: user.security_tier,
          online: onlineUsers.has(user.id),
          lastSeen: onlineUsers.get(user.id)?.lastSeen,
        };

        return { user: safeUser };
      } catch (error: any) {
        fastify.log.error({ error }, 'Get user failed');
        reply.code(500);
        return { error: 'Failed to get user' };
      }
    }
  );

  /**
   * Get online status for multiple users
   * POST /api/v2/users/status
   */
  fastify.post<{
    Body: { userIds: string[] };
  }>(
    '/api/v2/users/status',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { userIds } = request.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        reply.code(400);
        return { error: 'userIds must be a non-empty array' };
      }

      const statuses = userIds.map(userId => {
        const userData = onlineUsers.get(userId);
        const isInvisible = userData?.status === 'invisible';
        return {
          userId,
          online: userData ? !isInvisible : false,
          status: isInvisible ? undefined : userData?.status,
          lastSeen: userData?.lastSeen,
        };
      });

      return { statuses };
    }
  );

  /**
   * Update current user's status
   * PUT /api/v2/users/me/status
   */
  fastify.put<{
    Body: { status: UserStatus };
  }>(
    '/api/v2/users/me/status',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        const { status } = request.body;

        const validStatuses: UserStatus[] = ['online', 'busy', 'away', 'invisible'];
        if (!validStatuses.includes(status)) {
          reply.code(400);
          return { error: 'Invalid status. Must be one of: online, busy, away, invisible' };
        }

        const success = setUserStatus(userId, status);
        if (!success) {
          reply.code(404);
          return { error: 'User not found in online users' };
        }

        fastify.log.info({ userId, status }, 'User status updated');

        return { success: true, status };
      } catch (error: any) {
        fastify.log.error({ error }, 'Update status failed');
        reply.code(500);
        return { error: 'Failed to update status' };
      }
    }
  );

  /**
   * Get current user's status
   * GET /api/v2/users/me/status
   */
  fastify.get(
    '/api/v2/users/me/status',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        const status = getUserStatus(userId);

        return { status: status || 'offline' };
      } catch (error: any) {
        fastify.log.error({ error }, 'Get status failed');
        reply.code(500);
        return { error: 'Failed to get status' };
      }
    }
  );
}
