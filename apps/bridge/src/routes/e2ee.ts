/**
 * E2EE Routes - Key Bundle Management
 *
 * Endpoints for publishing and retrieving E2EE key bundles
 * Supports X3DH protocol with Signed Pre-Keys and One-Time Pre-Keys
 * 
 * Now using PostgreSQL via main database
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

// ============================================================================
// SCHEMAS
// ============================================================================

const SignedPreKeySchema = z.object({
  keyId: z.number(),
  publicKey: z.string(),
  signature: z.string(),
});

// One-Time Pre-Key with ID for X3DH
const OneTimePreKeySchema = z.object({
  id: z.number(),
  publicKey: z.string(),
});

const KeyBundleSchema = z.object({
  identityKey: z.string(),                // X25519 public key (base64) for DH
  signingKey: z.string().optional(),      // Ed25519 public key (base64) for SPK verification
  fingerprint: z.string(),
  signedPreKey: SignedPreKeySchema,       // Signed with Ed25519 (if signingKey present)
  // Support both old format (array of strings) and new format (array of objects with id)
  oneTimePreKeys: z.union([
    z.array(z.string()),
    z.array(OneTimePreKeySchema),
  ]),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function e2eeRoutes(fastify: FastifyInstance) {
  /**
   * Publish user's key bundle
   * POST /api/v2/e2ee/publish-keys
   */
  fastify.post<{
    Body: z.infer<typeof KeyBundleSchema>;
  }>(
    '/api/v2/e2ee/publish-keys',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub;
      
      try {
        // Validate request body
        const parseResult = KeyBundleSchema.safeParse(request.body);
        
        if (!parseResult.success) {
          fastify.log.error({ 
            userId, 
            zodErrors: parseResult.error.errors,
            receivedBody: JSON.stringify(request.body).slice(0, 500) 
          }, 'Key bundle validation failed');
          reply.code(400);
          return { 
            error: 'Invalid key bundle', 
            details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          };
        }

        // Upsert key bundle using main database
        await db.upsertE2eeKeyBundle(userId, parseResult.data);
        
        fastify.log.info({ userId }, 'E2EE key bundle published');
        
        return { success: true };
      } catch (error) {
        fastify.log.error({ error, userId }, 'Failed to publish key bundle');
        reply.code(400);
        return { error: 'Invalid key bundle', details: [(error as Error).message] };
      }
    }
  );

  /**
   * Get user's key bundle by username
   * GET /api/v2/e2ee/keys/:username
   */
  fastify.get<{
    Params: { username: string };
  }>(
    '/api/v2/e2ee/keys/:username',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { username } = request.params;

      try {
        // Get key bundle using main database
        const keyBundle = await db.getE2eeKeyBundleByUsername(username);

        if (!keyBundle) {
          reply.code(404);
          return { error: 'No key bundle found for this user' };
        }

        // Parse one-time prekeys
        const oneTimePreKeys = JSON.parse(keyBundle.one_time_prekeys || '[]');

        return {
          identityKey: keyBundle.identity_key,
          signingKey: keyBundle.signing_key || null, // Ed25519 public key (may be null for old bundles)
          fingerprint: keyBundle.fingerprint,
          signedPreKey: {
            keyId: keyBundle.signed_prekey_id,
            publicKey: keyBundle.signed_prekey_public,
            signature: keyBundle.signed_prekey_signature,
          },
          oneTimePreKeys,
        };
      } catch (error) {
        fastify.log.error({ error, username }, 'Failed to get key bundle');
        reply.code(500);
        return { error: 'Failed to retrieve key bundle' };
      }
    }
  );

  /**
   * Consume a one-time pre-key (X3DH handshake)
   * POST /api/v2/e2ee/consume-opk/:username
   * 
   * This endpoint atomically retrieves and removes one OPK from a user's bundle.
   * Used during X3DH handshake initiation.
   */
  fastify.post<{
    Params: { username: string };
  }>(
    '/api/v2/e2ee/consume-opk/:username',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const { username } = request.params;
      const requesterId = (request.user as any).sub;

      try {
        // Get key bundle
        const keyBundle = await db.getE2eeKeyBundleByUsername(username);

        if (!keyBundle) {
          reply.code(404);
          return { error: 'No key bundle found for this user' };
        }

        // Parse one-time prekeys
        let oneTimePreKeys: Array<{ id: number; publicKey: string } | string> = [];
        try {
          oneTimePreKeys = JSON.parse(keyBundle.one_time_prekeys || '[]');
        } catch {
          oneTimePreKeys = [];
        }

        if (oneTimePreKeys.length === 0) {
          // No OPKs available, return bundle without OPK
          return {
            identityKey: keyBundle.identity_key,
            signingKey: keyBundle.signing_key || null, // Ed25519 public key
            fingerprint: keyBundle.fingerprint,
            signedPreKey: {
              keyId: keyBundle.signed_prekey_id,
              publicKey: keyBundle.signed_prekey_public,
              signature: keyBundle.signed_prekey_signature,
            },
            oneTimePreKey: null,
          };
        }

        // Consume the first OPK
        const consumedOPK = oneTimePreKeys.shift();
        
        // Update the database with remaining OPKs
        await db.updateOneTimePreKeys(keyBundle.user_id, JSON.stringify(oneTimePreKeys));

        fastify.log.info({ 
          requester: requesterId, 
          target: username, 
          consumedOPK: typeof consumedOPK === 'object' ? consumedOPK.id : 'legacy' 
        }, 'OPK consumed for X3DH');

        return {
          identityKey: keyBundle.identity_key,
          signingKey: keyBundle.signing_key || null, // Ed25519 public key
          fingerprint: keyBundle.fingerprint,
          signedPreKey: {
            keyId: keyBundle.signed_prekey_id,
            publicKey: keyBundle.signed_prekey_public,
            signature: keyBundle.signed_prekey_signature,
          },
          oneTimePreKey: consumedOPK,
        };
      } catch (error) {
        fastify.log.error({ error, username }, 'Failed to consume OPK');
        reply.code(500);
        return { error: 'Failed to consume one-time pre-key' };
      }
    }
  );

  /**
   * Replenish one-time pre-keys
   * POST /api/v2/e2ee/replenish-opks
   * 
   * Allows users to add more OPKs to their bundle
   */
  fastify.post<{
    Body: { oneTimePreKeys: Array<{ id: number; publicKey: string }> };
  }>(
    '/api/v2/e2ee/replenish-opks',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub;
      const { oneTimePreKeys } = request.body;

      try {
        // Get current bundle
        const keyBundle = await db.getE2eeKeyBundleByUserId(userId);

        if (!keyBundle) {
          reply.code(404);
          return { error: 'No key bundle found' };
        }

        // Parse existing OPKs
        let existingOPKs: Array<{ id: number; publicKey: string }> = [];
        try {
          existingOPKs = JSON.parse(keyBundle.one_time_prekeys || '[]');
        } catch {
          existingOPKs = [];
        }

        // Merge with new OPKs (avoid duplicates by id)
        const existingIds = new Set(existingOPKs.map(opk => opk.id));
        const newOPKs = oneTimePreKeys.filter(opk => !existingIds.has(opk.id));
        const mergedOPKs = [...existingOPKs, ...newOPKs];

        // Update database
        await db.updateOneTimePreKeys(userId, JSON.stringify(mergedOPKs));

        fastify.log.info({ userId, added: newOPKs.length, total: mergedOPKs.length }, 'OPKs replenished');

        return { success: true, totalOPKs: mergedOPKs.length };
      } catch (error) {
        fastify.log.error({ error, userId }, 'Failed to replenish OPKs');
        reply.code(500);
        return { error: 'Failed to replenish one-time pre-keys' };
      }
    }
  );
}
