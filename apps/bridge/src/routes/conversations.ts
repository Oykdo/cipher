import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';
import { randomUUID } from 'crypto';

const db = getDatabase();

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
}

export async function conversationRoutes(fastify: FastifyInstance) {
  // List user conversations
  fastify.get(
    '/api/v2/conversations',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request) => {
      const userId = (request.user as any).sub as string;
      const userConversations = await db.getUserConversations(userId);

      const conversations = [] as any[];
      for (const convo of userConversations) {
        const members = await db.getConversationMembers(convo.id);
        const participants = [] as any[];
        for (const memberId of members) {
          const user = await db.getUserById(memberId);
          if (user) participants.push({ id: user.id, username: user.username });
        }

        // Find the other participant (not the current user)
        const otherParticipant = participants.find(p => p.id !== userId);

        if (!otherParticipant) {
          continue; // Skip if no other participant found
        }

        let lastMessage: MessageRecord | null = null;
        if (convo.last_message_id) {
          const dbMessage = await db.getMessageById(convo.last_message_id);
          if (dbMessage) {
            lastMessage = {
              id: dbMessage.id,
              conversationId: dbMessage.conversation_id,
              senderId: dbMessage.sender_id,
              body: dbMessage.body,
              createdAt: dbMessage.created_at,
            };
          }
        }

        // ✅ Transform to match frontend ConversationSummaryV2 interface
        // Don't send encrypted preview - use generic message instead
        let preview: string | undefined = undefined;
        if (lastMessage) {
          // Always use a generic preview for privacy
          // The actual decryption will happen when opening the conversation
          preview = 'Nouveau message';
        }

        conversations.push({
          id: convo.id,
          createdAt: convo.created_at,
          lastMessageAt: convo.last_message_at || undefined,
          lastMessagePreview: preview,
          otherParticipant: {
            id: otherParticipant.id,
            username: otherParticipant.username,
          }
        });
      }

      // ✅ Return object with conversations property
      return { conversations };
    }
  );

  // Create conversation
  fastify.post(
    '/api/v2/conversations',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const body = request.body as { targetUsername?: string };
      const targetUsername = body.targetUsername?.toLowerCase();

      if (!targetUsername) {
        reply.code(400);
        return { error: 'targetUsername requis' };
      }

      const targetUser = await db.getUserByUsername(targetUsername);
      if (!targetUser) {
        reply.code(404);
        return { error: 'Utilisateur introuvable' };
      }

      if (targetUser.id === userId) {
        reply.code(400);
        return { error: 'Impossible de créer une conversation avec soi-même' };
      }

      const convoId = randomUUID();
      const convo = await db.createConversation(convoId, [userId, targetUser.id]);

      const members = await db.getConversationMembers(convo.id);
      const participants = [] as any[];
      for (const memberId of members) {
        const user = await db.getUserById(memberId)!;
        participants.push({ id: user.id, username: user.username });
      }

      const payload = {
        id: convo.id,
        participants,
        lastMessage: null as MessageRecord | null,
      };

      fastify.broadcast(members, {
        type: 'conversation',
        conversation: payload,
      });

      return payload;
    }
  );

  // Note: User search moved to /routes/users.ts
}
