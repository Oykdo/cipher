/**
 * Route Registration - Presentation Layer
 * 
 * Central registry for all HTTP routes
 */

import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.routes';
import { registerConversationRoutes } from './conversation.routes';
import { registerMessageRoutes } from './message.routes';

export async function registerRoutes(
  app: FastifyInstance,
  controllers: {
    auth: any;
    conversation: any;
    message: any;
  }
) {
  // Register all routes
  await registerAuthRoutes(app, controllers.auth);
  await registerConversationRoutes(app, controllers.conversation);
  await registerMessageRoutes(app, controllers.message);

  // Health check route (public)
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
    };
  });
}
