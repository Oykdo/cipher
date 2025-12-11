/**
 * Authentication Routes - Presentation Layer
 */

import type { FastifyInstance } from 'fastify';
import type { AuthController } from '../controllers/AuthController';
import { createRateLimiter } from '../../../middleware/rateLimiter';

export async function registerAuthRoutes(
  app: FastifyInstance,
  controller: AuthController
) {
  // POST /auth/signup - Create new account
  app.post(
    '/auth/signup',
    {
      onRequest: createRateLimiter({ maxRequests: 5, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.signup(request);
      return reply.code(201).send(result);
    }
  );

  // POST /auth/login - Authenticate user
  app.post(
    '/auth/login',
    {
      onRequest: createRateLimiter({ maxRequests: 10, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.login(request);
      return reply.send(result);
    }
  );

  // POST /auth/refresh - Refresh access token
  app.post(
    '/auth/refresh',
    {
      onRequest: createRateLimiter({ maxRequests: 20, windowMs: 60 * 1000 }) as any,
    },
    async (request: any, reply: any) => {
      const result = await controller.refresh(request);
      return reply.send(result);
    }
  );

  // POST /auth/logout - Logout user
  app.post(
    '/auth/logout',
    {
      preHandler: [app.authenticate] as any, // Requires authentication
    },
    async (request: any, reply: any) => {
      const result = await controller.logout(request);
      return reply.send(result);
    }
  );
}
