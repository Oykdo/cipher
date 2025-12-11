/**
 * Message Acknowledgement Routes
 * 
 * Gère l'accusé de réception des messages Burn After Reading
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';
import { burnScheduler } from '../services/burn-scheduler.js';

const db = getDatabase();

export async function acknowledgeRoutes(fastify: FastifyInstance) {
  /**
   * Acknowledge a message (start burn countdown)
   */
  fastify.post(
    '/api/v2/messages/:messageId/acknowledge',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const { messageId } = request.params as { messageId: string };
      const { conversationId } = request.body as { conversationId?: string };

      if (!conversationId) {
        reply.code(400);
        return { error: 'conversationId requis' };
      }

      // Verify user is member of conversation
      const members = await db.getConversationMembers(conversationId);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      // Get message
      const message = await db.getMessageById(messageId);
      if (!message) {
        reply.code(404);
        return { error: 'Message introuvable' };
      }

      if (message.conversation_id !== conversationId) {
        reply.code(400);
        return { error: 'Message ne fait pas partie de cette conversation' };
      }

      // Check if message has scheduled burn
      if (!message.scheduled_burn_at) {
        reply.code(400);
        return { error: 'Ce message n\'a pas de burn programmé' };
      }

      // Check if already burned
      if (message.is_burned) {
        reply.code(400);
        return { error: 'Message déjà brûlé' };
      }

      // Check if user is not the sender (can't acknowledge own message)
      if (message.sender_id === userId) {
        reply.code(400);
        return { error: 'Vous ne pouvez pas accuser réception de votre propre message' };
      }

      // Schedule burn with the configured delay
      burnScheduler.schedule(messageId, conversationId, message.scheduled_burn_at);

      fastify.log.info({
        messageId,
        conversationId,
        userId,
        scheduledBurnAt: new Date(message.scheduled_burn_at).toISOString(),
      }, 'Message acknowledged - burn countdown started');

      return {
        success: true,
        scheduledBurnAt: message.scheduled_burn_at,
      };
    }
  );

  /**
   * Manual burn (for testing or immediate destruction)
   */
  fastify.post(
    '/api/v2/messages/:messageId/burn',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const { messageId } = request.params as { messageId: string };

      // Get message
      const message = await db.getMessageById(messageId);
      if (!message) {
        reply.code(404);
        return { error: 'Message introuvable' };
      }

      // Verify user is member of conversation
      const members = await db.getConversationMembers(message.conversation_id);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Message introuvable' };
      }

      // Check if already burned
      if (message.is_burned) {
        reply.code(400);
        return { error: 'Message déjà brûlé' };
      }

      const burnedAt = Date.now();

      // Burn message
      await db.burnMessage(messageId, burnedAt);

      // Cancel scheduled burn if any
      burnScheduler.cancel(messageId);

      // Notify clients
      fastify.io.emitMessageBurned({
        conversationId: message.conversation_id,
        messageId,
        burnedAt,
      });

      fastify.log.info({
        messageId,
        conversationId: message.conversation_id,
        userId,
        burnedAt: new Date(burnedAt).toISOString(),
      }, 'Message manually burned');

      return {
        success: true,
        burnedAt,
      };
    }
  );
}
