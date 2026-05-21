import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';
import { randomUUID } from 'crypto';
import {
  buildConversationSummary,
  type ConversationSummary,
} from '../utils/conversationSummary.js';
import {
  ConversationIdSchema,
  PostPickupRetentionDaysSchema,
} from '../validation/securitySchemas.js';

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

  // Conversation-level post-pickup retention cap. Any member can reduce
  // retention; extension to 30 days only takes effect when every member's
  // user privacy setting also opts in.
  fastify.patch(
    '/api/v2/conversations/:id/retention',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const id = (request.params as { id: string }).id;
      const body = (request.body as { postPickupRetentionDays?: unknown } | undefined) ?? {};

      const idResult = ConversationIdSchema.safeParse(id);
      if (!idResult.success) {
        reply.code(400);
        return { error: 'Format conversationId invalide', details: idResult.error.issues };
      }

      const retentionResult = PostPickupRetentionDaysSchema.safeParse(body.postPickupRetentionDays);
      if (!retentionResult.success) {
        reply.code(400);
        return {
          error: 'postPickupRetentionDays doit valoir 0, 1, 7, 30 ou null',
          details: retentionResult.error.issues,
        };
      }

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

      const updated = await db.updateConversationPostPickupRetentionDays(
        id,
        retentionResult.data,
      );
      if (retentionResult.data === 0) {
        await db.purgeZeroRetentionDeliveredMessagesForConversation(id);
      }

      const summary = await buildConversationSummary(updated, userId);
      if (!summary) {
        reply.code(500);
        return { error: 'Conversation mise à jour mais introuvable' };
      }

      fastify.broadcast(members, {
        type: 'conversation',
        conversation: summary,
      });

      return summary;
    },
  );

  // Note: User search lives in /routes/users.ts.
  // Note: Group creation/management lives in /routes/groups.ts.
}
