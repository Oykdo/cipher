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

const db = getDatabase();

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
    publicKey: string;       // Base64 encoded Curve25519 public key
    signPublicKey: string;   // Base64 encoded Ed25519 public key
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
        const publicKeys = await db.getPublicKeysByUserIds(userIds);
        
        // Return keys
        return {
          keys: publicKeys.map(key => ({
            userId: key.user_id,
            username: key.username,
            publicKey: key.public_key,
            signPublicKey: key.sign_public_key,
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
        
        // Validate base64 format
        if (!isValidBase64(publicKey) || !isValidBase64(signPublicKey)) {
          reply.code(400);
          return { error: 'publicKey and signPublicKey must be valid base64 strings' };
        }
        
        // Update database
        await db.updateUserPublicKeys(userId, publicKey, signPublicKey);
        
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
      try {
        const userId = (request.user as any).sub;
        const conversationId = request.params.id;
        
        // Verify user is a member of this conversation
        const isMember = await db.isConversationMember(conversationId, userId);
        if (!isMember) {
          reply.code(403);
          return { error: 'You are not a member of this conversation' };
        }
        
        // Get all members with their public keys
        const members = await db.getConversationMembersWithKeys(conversationId);
        
        return {
          members: members.map(member => ({
            userId: member.user_id,
            username: member.username,
            publicKey: member.public_key || undefined,
            signPublicKey: member.sign_public_key || undefined,
          })),
        };
      } catch (error) {
        console.error('[PublicKeys] Error fetching conversation members:', error);
        reply.code(500);
        return { error: 'Failed to fetch conversation members' };
      }
    }
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Validate base64 string
 */
function isValidBase64(str: string): boolean {
  try {
    // Check if it's a valid base64 string
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length > 0;
  } catch {
    return false;
  }
}
