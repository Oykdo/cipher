/**
 * Message Routes - Presentation Layer
 */

import type { FastifyInstance } from 'fastify';
import type { MessageController } from '../controllers/MessageController';
import { createRateLimiter } from '../../../middleware/rateLimiter';

export async function registerMessageRoutes(
  app: FastifyInstance,
  controller: MessageController
) {
  // POST /conversations/:conversationId/messages - Send message
  app.post(
    '/conversations/:conversationId/messages',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 20, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.send(request as any);
      return reply.code(201).send(result);
    }
  );

  // GET /conversations/:conversationId/messages - Get messages (paginated)
  app.get(
    '/conversations/:conversationId/messages',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.list(request as any);
      return reply.send(result);
    }
  );

  // POST /conversations/:conversationId/messages/:messageId/acknowledge
  app.post(
    '/conversations/:conversationId/messages/:messageId/acknowledge',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 50, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.acknowledge(request as any);
      return reply.send(result);
    }
  );

  // POST /conversations/:conversationId/messages/:messageId/burn
  app.post(
    '/conversations/:conversationId/messages/:messageId/burn',
    {
      preHandler: [app.authenticate] as any,
      onRequest: createRateLimiter({ maxRequests: 20, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.burn(request as any);
      return reply.send(result);
    }
  );
}
