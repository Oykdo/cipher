import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';
import { randomUUID } from 'crypto';
import {
  buildConversationSummary,
  type ConversationSummary,
} from '../utils/conversationSummary.js';

const db = getDatabase();

export async function conversationRoutes(fastify: FastifyInstance) {
  // List user conversations (direct + group, augmented shape)
  fastify.get(
    '/api/v2/conversations',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request) => {
      const userId = (request.user as any).sub as string;
      const userConversations = await db.getUserConversations(userId);

      const conversations: ConversationSummary[] = [];
      for (const convo of userConversations) {
        const summary = await buildConversationSummary(convo, userId);
        if (summary) conversations.push(summary);
      }

      return { conversations };
    },
  );

  // Create a direct (1:1) conversation. Group creation lives in routes/groups.ts.
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
      const convo = await db.createConversation(
        convoId,
        [userId, targetUser.id],
        { type: 'direct' },
      );

      const summary = await buildConversationSummary(convo, userId);
      if (!summary) {
        reply.code(500);
        return { error: 'Conversation créée mais introuvable' };
      }

      const memberIds = summary.members.map((m) => m.id);
      fastify.broadcast(memberIds, {
        type: 'conversation',
        conversation: summary,
      });

      return summary;
    },
  );

  // Note: User search lives in /routes/users.ts.
  // Note: Group creation/management lives in /routes/groups.ts.
}
