/**
 * Public Keys Routes - e2ee-v2 Support
 * 
 * Endpoints pour la gestion des clés publiques :
 * - POST /api/v2/users/public-keys - Récupérer les clés publiques de plusieurs utilisateurs
 * - PUT /api/v2/users/me/public-keys - Mettre à jour ses propres clés publiques
 * - GET /api/v2/conversations/:id/members - Récupérer les membres d'une conversation avec leurs clés
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/database.js';

// Helper to get DB instance
function getDB() {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ============================================================================
// TYPES
// ============================================================================

interface GetPublicKeysRequest {
  Body: {
    userIds: string[];
  };
}

interface UploadPublicKeysRequest {
  Body: {
    publicKey: string;       // Base64 (preferably base64url) encoded Curve25519 public key
    signPublicKey: string;   // Base64 (preferably base64url) encoded Ed25519 public key
  };
}

interface GetConversationMembersRequest {
  Params: {
    id: string;  // conversation ID
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function publicKeysRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /api/v2/users/public-keys
   * Get public keys for multiple users
   */
  fastify.post<GetPublicKeysRequest>(
    '/api/v2/users/public-keys',
    {
      preHandler: fastify.authenticate,
    },
    async (request: FastifyRequest<GetPublicKeysRequest>, reply: FastifyReply) => {
      try {
        const { userIds } = request.body;
        
        // Validation
        if (!Array.isArray(userIds) || userIds.length === 0) {
          reply.code(400);
          return { error: 'userIds must be a non-empty array' };
        }
        
        // Limit to 100 users per request
        if (userIds.length > 100) {
          reply.code(400);
          return { error: 'Maximum 100 userIds per request' };
        }
        
        // Get public keys from database
        const publicKeys = await getDB().getPublicKeysByUserIds(userIds);
        
        // Return keys
        return {
          keys: publicKeys.map((key: any) => ({
            userId: key.user_id,
            username: key.username,
            // Normalize to base64url so browser libsodium can decode reliably
            publicKey: normalize32ByteKeyToBase64Url(key.public_key) || key.public_key,
            signPublicKey: normalize32ByteKeyToBase64Url(key.sign_public_key) || key.sign_public_key,
          })),
        };
      } catch (error) {
        console.error('[PublicKeys] Error fetching public keys:', error);
        reply.code(500);
        return { error: 'Failed to fetch public keys' };
      }
    }
  );
  
  /**
   * PUT /api/v2/users/me/public-keys
   * Upload/update current user's public keys
   */
  fastify.put<UploadPublicKeysRequest>(
    '/api/v2/users/me/public-keys',
    {
      preHandler: fastify.authenticate,
    },
    async (request: FastifyRequest<UploadPublicKeysRequest>, reply: FastifyReply) => {
      try {
        const userId = (request.user as any).sub;
        const { publicKey, signPublicKey } = request.body;
        
        // Validation
        if (!publicKey || !signPublicKey) {
          reply.code(400);
          return { error: 'publicKey and signPublicKey are required' };
        }
        
        // Validate and normalize base64/base64url to base64url (libsodium browser default)
        const normalizedPublicKey = normalize32ByteKeyToBase64Url(publicKey);
        const normalizedSignPublicKey = normalize32ByteKeyToBase64Url(signPublicKey);

        if (!normalizedPublicKey || !normalizedSignPublicKey) {
          reply.code(400);
          return { error: 'publicKey and signPublicKey must be valid base64/base64url strings encoding 32-byte keys' };
        }
        
        // Update database
        await getDB().updateUserPublicKeys(userId, normalizedPublicKey, normalizedSignPublicKey);
        
        console.log(`✅ [PublicKeys] Updated public keys for user ${userId}`);
        
        return {
          success: true,
          message: 'Public keys updated successfully',
        };
      } catch (error) {
        console.error('[PublicKeys] Error uploading public keys:', error);
        reply.code(500);
        return { error: 'Failed to upload public keys' };
      }
    }
  );
  
  /**
   * GET /api/v2/conversations/:id/members
   * Get all members of a conversation with their public keys
   */
  fastify.get<GetConversationMembersRequest>(
    '/api/v2/conversations/:id/members',
    {
      preHandler: fastify.authenticate,
    },
    async (request: FastifyRequest<GetConversationMembersRequest>, reply: FastifyReply) => {
      console.log('[PublicKeys] GET /conversations/:id/members called for:', request.params.id);
      try {
        const userId = (request.user as any).sub;
        const conversationId = request.params.id;
        
        // Verify user is a member of this conversation
        const isMember = await getDB().isConversationMember(conversationId, userId);
        if (!isMember) {
          reply.code(403);
          return { error: 'You are not a member of this conversation' };
        }
        
        // Get all members with their public keys
        const members = await getDB().getConversationMembersWithKeys(conversationId);
        
        return {
          members: members.map((member: any) => ({
            userId: member.user_id,
            username: member.username,
            publicKey: member.public_key ? (normalize32ByteKeyToBase64Url(member.public_key) || member.public_key) : undefined,
            signPublicKey: member.sign_public_key ? (normalize32ByteKeyToBase64Url(member.sign_public_key) || member.sign_public_key) : undefined,
          })),
        };
      } catch (error) {
        console.error('[PublicKeys] Error fetching conversation members:', error);
        console.error('[PublicKeys] Error details:', {
          message: (error as Error).message,
          stack: (error as Error).stack,
          conversationId: request.params.id,
        });
        reply.code(500);
        return { error: 'Failed to fetch conversation members', details: (error as Error).message };
      }
    }
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Normalize a 32-byte key encoded as base64/base64url into base64url.
 *
 * Why: libsodium-wrappers in the browser defaults to base64url (no padding),
 * so returning base64url avoids decode failures client-side.
 */
function normalize32ByteKeyToBase64Url(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  // Quick charset check (accept base64 and base64url)
  const charset = /^[A-Za-z0-9+/_-]+={0,2}$/;
  if (!charset.test(value)) return null;

  const decoded = tryDecode32Bytes(value, 'base64url') ?? tryDecode32Bytes(value, 'base64');
  if (!decoded) return null;
  return decoded.toString('base64url');
}

function tryDecode32Bytes(value: string, encoding: 'base64' | 'base64url'): Buffer | null {
  try {
    const buf = Buffer.from(value, encoding);
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}
