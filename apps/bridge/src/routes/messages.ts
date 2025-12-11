import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/database.js';
import * as blockchain from '../services/blockchain-bitcoin.js';
import { ConversationIdSchema } from '../validation/securitySchemas.js';

const db = getDatabase();

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
  unlockBlockHeight?: number;
  isLocked?: boolean;
}

export async function messageRoutes(fastify: FastifyInstance) {
  // Get conversation messages (paginated)
  fastify.get(
    '/api/v2/conversations/:id/messages',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const id = (request.params as { id: string }).id;
      const { before, limit } = (request.query as any) || {};

      const convo = await db.getConversationById(id);
      if (!convo) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const members = await db.getConversationMembers(id);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const cursor = Number(before) || Date.now() + 1;

      fastify.log.info({
        conversationId: id,
        cursor,
        pageLimit,
      }, '[MESSAGES] Fetching messages from DB');

      const pageDesc = await db.getConversationMessagesPaged(id, cursor, pageLimit);
      const dbMessages = pageDesc.reverse();

      fastify.log.info({
        conversationId: id,
        messagesFromDb: dbMessages.length,
        firstMessageId: dbMessages[0]?.id,
      }, '[MESSAGES] Messages fetched from DB');

      // Server-side time-lock validation
      const messages = await Promise.all(
        dbMessages.map(async (msg) => {
          const unlockHeight = msg.unlock_block_height;

          // ✅ FIX: Ne vérifier isLocked QUE si unlockHeight est défini ET supérieur à 0
          // Messages standards ont unlockHeight = null, donc isLocked = false
          const isLocked = (unlockHeight && unlockHeight > 0)
            ? !(await blockchain.canUnlock(unlockHeight))
            : false;

          // ✅ IMPORTANT: Toujours retourner msg.body (chiffré) sauf si vraiment verrouillé
          // Ne pas retourner '[Message verrouillé]' si isLocked est false
          return {
            id: msg.id,
            conversationId: msg.conversation_id,
            senderId: msg.sender_id,
            body: isLocked ? '[Message verrouillé]' : msg.body,
            createdAt: msg.created_at,
            unlockBlockHeight: unlockHeight || undefined,
            isLocked,
            // Burn After Reading fields
            isBurned: msg.is_burned || false,
            burnedAt: msg.burned_at ? new Date(msg.burned_at).getTime() : undefined,
            scheduledBurnAt: msg.scheduled_burn_at ? new Date(msg.scheduled_burn_at).getTime() : undefined,
          };
        })
      );

      // SECURITY FIX VUL-005: Don't log message content
      fastify.log.info({
        conversationId: id,
        messagesReturned: messages.length,
        hasLockedMessages: messages.some(m => m.isLocked),
      }, '[MESSAGES] Returning messages to client');

      // ✅ FIX: Return object with messages property (not array directly)
      // Frontend expects: { messages: [...], hasMore: boolean }
      return {
        messages,
        hasMore: messages.length >= pageLimit,
      };
    }
  );

  // Send message
  fastify.post(
    '/api/v2/messages',
    {
      preHandler: fastify.authenticate as any,
      config: { rateLimit: fastify.messageLimiter as any },
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const { conversationId, body, unlockBlockHeight, scheduledBurnAt } = request.body as {
        conversationId?: string;
        body?: string;
        unlockBlockHeight?: number;
        scheduledBurnAt?: number;
      };

      if (!conversationId || !body) {
        reply.code(400);
        return { error: 'conversationId et body requis' };
      }

      // Validate message size (max 100KB)
      if (body.length > 100000) {
        reply.code(413);
        return { error: 'Message trop long (max 100KB)' };
      }

      // SECURITY FIX VUL-004: Use strict Zod schema for validation
      const validationResult = ConversationIdSchema.safeParse(conversationId);
      if (!validationResult.success) {
        reply.code(400);
        return { error: 'Format conversationId invalide', details: validationResult.error.issues };
      }

      // Validate unlock height
      if (unlockBlockHeight !== undefined) {
        if (typeof unlockBlockHeight !== 'number' || unlockBlockHeight < 0) {
          reply.code(400);
          return { error: 'unlockBlockHeight doit être un nombre positif' };
        }

        if (!blockchain.validateUnlockHeight(unlockBlockHeight)) {
          reply.code(400);
          return { error: 'unlockBlockHeight invalide (doit être futur, max 1 an)' };
        }
      }

      // Validate scheduled burn
      if (scheduledBurnAt !== undefined) {
        if (typeof scheduledBurnAt !== 'number' || scheduledBurnAt < Date.now()) {
          reply.code(400);
          return { error: 'scheduledBurnAt doit être un timestamp futur' };
        }

        // Max 7 days in the future
        const maxBurnDelay = 7 * 24 * 60 * 60 * 1000;
        if (scheduledBurnAt > Date.now() + maxBurnDelay) {
          reply.code(400);
          return { error: 'scheduledBurnAt ne peut pas dépasser 7 jours' };
        }
      }

      const convo = await db.getConversationById(conversationId);
      if (!convo) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const members = await db.getConversationMembers(conversationId);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const messageId = randomUUID();

      const dbMessage = await db.createMessage({
        id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        body,
        unlock_block_height: unlockBlockHeight,
        scheduled_burn_at: scheduledBurnAt,
      });

      // Schedule burn if needed
      if (scheduledBurnAt) {
        const { burnScheduler } = await import('../services/burn-scheduler.js');
        burnScheduler.schedule(messageId, conversationId, scheduledBurnAt);
      }

      const isLocked = unlockBlockHeight ? !(await blockchain.canUnlock(unlockBlockHeight)) : false;

      const message = {
        id: dbMessage.id,
        conversationId: dbMessage.conversation_id,
        senderId: dbMessage.sender_id,
        body: isLocked ? '[Message verrouillé]' : dbMessage.body,
        createdAt: typeof dbMessage.created_at === 'object' 
          ? new Date(dbMessage.created_at).getTime() 
          : dbMessage.created_at,
        unlockBlockHeight: unlockBlockHeight,
        isLocked,
        // Burn After Reading fields
        isBurned: false,
        scheduledBurnAt: scheduledBurnAt,
      };

      const payload = {
        type: 'message' as const,
        conversationId,
        message,
      };

      // Legacy WebSocket broadcast
      fastify.broadcast(members, payload);

      // Socket.IO emit for real-time updates
      fastify.io.emitNewMessage({
        conversationId,
        message: {
          id: message.id,
          senderId: message.senderId,
          body: isLocked ? '[Message verrouillé]' : dbMessage.body,
          createdAt: message.createdAt,
          unlockBlockHeight: message.unlockBlockHeight,
          scheduledBurnAt: scheduledBurnAt,
          isLocked: isLocked,
        },
      });

      return message;
    }
  );
}
