import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

interface MarkKeyLostBody {
  reason?: string;
}

export async function recoveryRoutes(fastify: FastifyInstance) {
  /**
   * Mark the current user's primary key as LOST for Trust-Star computations.
   *
   * POST /api/v1/recovery/mark-key-lost
   */
  fastify.post<{
    Body: MarkKeyLostBody;
  }>(
    '/api/v1/recovery/mark-key-lost',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = request.user?.sub as string | undefined;

      if (!userId) {
        reply.code(401);
        return {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            httpStatus: 401,
            details: {},
            correlationId: request.id,
          },
        };
      }

      try {
        const now = Date.now();

        await db.setMetadata(
          `trust_star:key_lost:${userId}`,
          JSON.stringify({
            at: now,
            reason: request.body?.reason || null,
          }),
        );

        return {
          success: true,
          markedAt: now,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Failed to mark primary key as lost');
        reply.code(500);
        return {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Unable to mark key as lost',
            httpStatus: 500,
            details: {},
            correlationId: request.id,
          },
        };
      }
    },
  );
}
