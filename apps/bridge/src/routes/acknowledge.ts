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

      // Calculate actual burn time
      let actualBurnTime: number;
      const scheduledBurnValue = typeof message.scheduled_burn_at === 'object'
        ? new Date(message.scheduled_burn_at).getTime()
        : message.scheduled_burn_at;

      if (scheduledBurnValue < 0) {
        // Negative value = delay in seconds after reading
        const delaySeconds = Math.abs(scheduledBurnValue);
        actualBurnTime = Date.now() + (delaySeconds * 1000);
        
        // Update the message with the actual burn time
        await db.scheduleBurn(messageId, actualBurnTime);
        
        fastify.log.info({
          messageId,
          delaySeconds,
          actualBurnTime: new Date(actualBurnTime).toISOString(),
        }, 'Calculated burn time from delay');
      } else {
        // Positive value = absolute timestamp
        actualBurnTime = scheduledBurnValue;
      }

      // Schedule burn with the calculated time
      burnScheduler.schedule(messageId, conversationId, actualBurnTime);

      fastify.log.info({
        messageId,
        conversationId,
        userId,
        scheduledBurnAt: new Date(actualBurnTime).toISOString(),
      }, 'Message acknowledged - burn countdown started');

      return {
        success: true,
        scheduledBurnAt: actualBurnTime,
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
