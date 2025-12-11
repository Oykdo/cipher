/**
 * Conversation Routes - Presentation Layer
 */

import type { FastifyInstance } from 'fastify';
import type { ConversationController } from '../controllers/ConversationController';
import { createRateLimiter } from '../../../middleware/rateLimiter';

export async function registerConversationRoutes(
  app: FastifyInstance,
  controller: ConversationController
) {
  // POST /conversations - Create new conversation
  app.post(
    '/conversations',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 5, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.create(request);
      return reply.code(201).send(result);
    }
  );

  // GET /conversations - List user's conversations
  app.get(
    '/conversations',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.list(request);
      return reply.send(result);
    }
  );

  // GET /conversations/:id - Get conversation details
  app.get(
    '/conversations/:id',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.getById(request as any);
      return reply.send(result);
    }
  );
}
