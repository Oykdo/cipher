/**
 * Group conversation routes (Cipher 1.2.0).
 *
 * Direct conversations live in routes/conversations.ts. This file owns
 * the explicitly-grouped surface — creating a group, inviting/removing
 * members, leaving, deleting. The owner (`created_by`) is the sole
 * privileged role in MVP; admins / co-owners are deferred to 1.3.
 *
 * Membership cap (2-10) is enforced applicatively in this file. The
 * underlying conversation_members junction table has no SQL trigger.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/database.js';
import {
  ConversationIdSchema,
  UsernameSchema,
  UserIdSchema,
} from '../validation/securitySchemas.js';
import { buildConversationSummary } from '../utils/conversationSummary.js';

const db = getDatabase();

const GROUP_MIN_OTHER_MEMBERS = 1; // owner + 1 = 2 total minimum
const GROUP_MAX_MEMBERS = 10;
const ENCRYPTED_TITLE_MAX = 8192; // ample headroom for a small e2ee-v2 envelope

const CreateGroupBodySchema = z.object({
  memberUsernames: z
    .array(UsernameSchema)
    .min(GROUP_MIN_OTHER_MEMBERS, 'A group needs at least one other member')
    .max(GROUP_MAX_MEMBERS - 1, `Cannot create a group with more than ${GROUP_MAX_MEMBERS} members`),
  encryptedTitle: z.string().max(ENCRYPTED_TITLE_MAX).optional(),
});

const AddMemberBodySchema = z.object({
  username: UsernameSchema,
  newEncryptedTitle: z.string().max(ENCRYPTED_TITLE_MAX).optional(),
});

const PatchGroupBodySchema = z.object({
  encryptedTitle: z.string().max(ENCRYPTED_TITLE_MAX),
});

const ConversationIdParamSchema = z.object({ id: ConversationIdSchema });
const RemoveMemberParamsSchema = z.object({
  id: ConversationIdSchema,
  userId: UserIdSchema,
});

async function loadGroupOrError(
  conversationId: string,
  reply: any,
): Promise<{ row: any; memberIds: string[] } | null> {
  const row = await db.getConversationById(conversationId);
  if (!row) {
    reply.code(404);
    reply.send({ error: 'Conversation introuvable' });
    return null;
  }
  if (row.type !== 'group') {
    reply.code(404);
    reply.send({ error: 'Cette opération est réservée aux groupes' });
    return null;
  }
  const memberIds = await db.getConversationMembers(conversationId);
  return { row, memberIds };
}

export async function groupRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // POST /api/v2/groups — create a group conversation.
  // ============================================================================
  fastify.post(
    '/api/v2/groups',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;

      const parsed = CreateGroupBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'Invalid body', details: parsed.error.issues };
      }
      const { memberUsernames, encryptedTitle } = parsed.data;

      // Resolve usernames → user IDs and reject duplicates / unknown / self.
      const dedupedUsernames = Array.from(
        new Set(memberUsernames.map((u) => u.toLowerCase())),
      );
      const memberIds: string[] = [];
      for (const username of dedupedUsernames) {
        const user = await db.getUserByUsername(username);
        if (!user) {
          reply.code(404);
          return { error: `Utilisateur introuvable: ${username}` };
        }
        if (user.id === userId) {
          reply.code(400);
          return { error: 'Le créateur est ajouté automatiquement, ne le mettez pas dans memberUsernames' };
        }
        memberIds.push(user.id);
      }

      const fullMemberIds = [userId, ...memberIds];
      if (fullMemberIds.length > GROUP_MAX_MEMBERS) {
        reply.code(400);
        return { error: `Un groupe ne peut pas dépasser ${GROUP_MAX_MEMBERS} membres` };
      }

      const convoId = randomUUID();
      const convo = await db.createConversation(convoId, fullMemberIds, {
        type: 'group',
        createdBy: userId,
        encryptedTitle: encryptedTitle ?? null,
      });

      const summary = await buildConversationSummary(convo, userId);
      if (!summary) {
        reply.code(500);
        return { error: 'Conversation créée mais introuvable' };
      }

      // Notify every member's user-room so their client list refreshes.
      fastify.broadcast(fullMemberIds, {
        type: 'conversation',
        conversation: summary,
      });

      reply.code(201);
      return summary;
    },
  );

  // ============================================================================
  // POST /api/v2/groups/:id/members — owner adds a member.
  // ============================================================================
  fastify.post(
    '/api/v2/groups/:id/members',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;

      const params = ConversationIdParamSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'Invalid conversation id' };
      }
      const body = AddMemberBodySchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400);
        return { error: 'Invalid body', details: body.error.issues };
      }

      const conversationId = params.data.id;
      const ctx = await loadGroupOrError(conversationId, reply);
      if (!ctx) return;
      const { row, memberIds } = ctx;

      if (row.created_by !== userId) {
        reply.code(403);
        return { error: 'Seul le propriétaire du groupe peut ajouter des membres' };
      }

      const newUser = await db.getUserByUsername(body.data.username.toLowerCase());
      if (!newUser) {
        reply.code(404);
        return { error: 'Utilisateur introuvable' };
      }

      if (memberIds.includes(newUser.id)) {
        reply.code(409);
        return { error: 'Cet utilisateur est déjà membre du groupe' };
      }
      if (memberIds.length >= GROUP_MAX_MEMBERS) {
        reply.code(409);
        return { error: `Le groupe a déjà atteint la limite de ${GROUP_MAX_MEMBERS} membres` };
      }

      await db.addConversationMember(conversationId, newUser.id);

      // Optional: update the encrypted title with a freshly-rewrapped envelope
      // that includes the new member's key. The frontend calculates this
      // before issuing the request; the server stores it opaquely.
      if (body.data.newEncryptedTitle !== undefined) {
        await db.updateConversationEncryptedTitle(
          conversationId,
          body.data.newEncryptedTitle,
        );
      }

      const updatedMemberIds = await db.getConversationMembers(conversationId);

      fastify.broadcast(updatedMemberIds, {
        type: 'group_member_added',
        conversationId,
        member: { id: newUser.id, username: newUser.username },
        memberCount: updatedMemberIds.length,
      });

      reply.code(201);
      return {
        member: { id: newUser.id, username: newUser.username },
        memberCount: updatedMemberIds.length,
      };
    },
  );

  // ============================================================================
  // DELETE /api/v2/groups/:id/members/:userId — owner removes (or self-remove).
  // ============================================================================
  fastify.delete(
    '/api/v2/groups/:id/members/:userId',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const callerId = (request.user as any).sub as string;

      const params = RemoveMemberParamsSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'Invalid params' };
      }
      const conversationId = params.data.id;
      const targetUserId = params.data.userId;

      const ctx = await loadGroupOrError(conversationId, reply);
      if (!ctx) return;
      const { row, memberIds } = ctx;

      const isOwner = row.created_by === callerId;
      const isSelfRemove = callerId === targetUserId;
      if (!isOwner && !isSelfRemove) {
        reply.code(403);
        return { error: 'Vous ne pouvez retirer que vous-même de ce groupe' };
      }

      if (targetUserId === row.created_by) {
        reply.code(400);
        return {
          error: "Le propriétaire ne peut pas être retiré du groupe — supprimez le groupe à la place",
        };
      }

      if (!memberIds.includes(targetUserId)) {
        reply.code(404);
        return { error: "Cet utilisateur n'est pas membre du groupe" };
      }

      const removed = await db.removeConversationMember(conversationId, targetUserId);
      if (!removed) {
        reply.code(500);
        return { error: 'Échec du retrait' };
      }

      const updatedMemberIds = await db.getConversationMembers(conversationId);

      // Notify the rest, plus the user being removed (so their list updates).
      fastify.broadcast([...updatedMemberIds, targetUserId], {
        type: 'group_member_removed',
        conversationId,
        userId: targetUserId,
        memberCount: updatedMemberIds.length,
      });

      reply.code(204);
      return null;
    },
  );

  // ============================================================================
  // POST /api/v2/groups/:id/leave — non-owner self-leave.
  // ============================================================================
  fastify.post(
    '/api/v2/groups/:id/leave',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const callerId = (request.user as any).sub as string;

      const params = ConversationIdParamSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'Invalid conversation id' };
      }
      const conversationId = params.data.id;

      const ctx = await loadGroupOrError(conversationId, reply);
      if (!ctx) return;
      const { row, memberIds } = ctx;

      if (row.created_by === callerId) {
        reply.code(403);
        return {
          error: "Le propriétaire ne peut pas quitter le groupe — supprimez-le à la place",
        };
      }

      if (!memberIds.includes(callerId)) {
        reply.code(404);
        return { error: "Vous n'êtes pas membre de ce groupe" };
      }

      await db.removeConversationMember(conversationId, callerId);
      const updatedMemberIds = await db.getConversationMembers(conversationId);

      fastify.broadcast([...updatedMemberIds, callerId], {
        type: 'group_member_removed',
        conversationId,
        userId: callerId,
        memberCount: updatedMemberIds.length,
      });

      reply.code(204);
      return null;
    },
  );

  // ============================================================================
  // PATCH /api/v2/groups/:id — update encrypted title (owner only).
  // ============================================================================
  fastify.patch(
    '/api/v2/groups/:id',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const callerId = (request.user as any).sub as string;

      const params = ConversationIdParamSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'Invalid conversation id' };
      }
      const body = PatchGroupBodySchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400);
        return { error: 'Invalid body', details: body.error.issues };
      }

      const conversationId = params.data.id;
      const ctx = await loadGroupOrError(conversationId, reply);
      if (!ctx) return;
      const { row } = ctx;

      if (row.created_by !== callerId) {
        reply.code(403);
        return { error: 'Seul le propriétaire peut modifier le titre du groupe' };
      }

      await db.updateConversationEncryptedTitle(conversationId, body.data.encryptedTitle);
      const memberIds = await db.getConversationMembers(conversationId);

      fastify.broadcast(memberIds, {
        type: 'group_title_updated',
        conversationId,
        encryptedTitle: body.data.encryptedTitle,
      });

      return { id: conversationId, encryptedTitle: body.data.encryptedTitle };
    },
  );

  // ============================================================================
  // DELETE /api/v2/groups/:id — owner deletes the entire group.
  // ============================================================================
  fastify.delete(
    '/api/v2/groups/:id',
    { preHandler: fastify.authenticate as any },
    async (request, reply) => {
      const callerId = (request.user as any).sub as string;

      const params = ConversationIdParamSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: 'Invalid conversation id' };
      }
      const conversationId = params.data.id;

      const ctx = await loadGroupOrError(conversationId, reply);
      if (!ctx) return;
      const { row, memberIds } = ctx;

      if (row.created_by !== callerId) {
        reply.code(403);
        return { error: 'Seul le propriétaire peut supprimer le groupe' };
      }

      // Capture members BEFORE delete so we can broadcast to them.
      const previousMembers = [...memberIds];
      await db.deleteConversation(conversationId);

      fastify.broadcast(previousMembers, {
        type: 'conversation_deleted',
        conversationId,
      });

      return { id: conversationId, deleted: true };
    },
  );
}
