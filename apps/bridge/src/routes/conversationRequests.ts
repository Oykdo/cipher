/**
 * Conversation Requests Routes - Handle conversation invitations
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';
import { randomUUID } from 'crypto';

const db = getDatabase();

export async function conversationRequestRoutes(fastify: FastifyInstance) {

    /**
     * Send a conversation request
     * POST /api/v2/conversation-requests
     */
    fastify.post<{ Body: { targetUsername: string; message?: string } }>(
        '/api/v2/conversation-requests',
        {
            preHandler: fastify.authenticate as any,
        },
        async (request, reply) => {
            const userId = (request.user as any).sub as string;
            const { targetUsername, message } = request.body;

            if (!targetUsername) {
                reply.code(400);
                return { error: 'targetUsername requis' };
            }

            const targetUser = await db.getUserByUsername(targetUsername.toLowerCase());
            if (!targetUser) {
                reply.code(404);
                return { error: 'Utilisateur introuvable' };
            }

            if (targetUser.id === userId) {
                reply.code(400);
                return { error: 'Impossible de s\'envoyer une demande à soi-même' };
            }

            // Check if a conversation already exists
            const userConversations = await db.getUserConversations(userId);
            for (const conv of userConversations) {
                const members = await db.getConversationMembers(conv.id);
                if (members.includes(targetUser.id)) {
                    reply.code(400);
                    return { error: 'Une conversation existe déjà avec cet utilisateur' };
                }
            }

            // Check if a request already exists
            const existingRequest = await db.checkExistingRequest(userId, targetUser.id);
            if (existingRequest) {
                if (existingRequest.status === 'pending') {
                    reply.code(400);
                    return { error: 'Une demande est déjà en attente' };
                }
            }

            const requestId = randomUUID();
            const conversationRequest = await db.createConversationRequest({
                id: requestId,
                from_user_id: userId,
                to_user_id: targetUser.id,
                message,
            });

            const currentUser = await db.getUserById(userId);

            // Notify via WebSocket
            (fastify as any).broadcast([targetUser.id], {
                type: 'conversation_request',
                request: {
                    id: conversationRequest.id,
                    fromUser: {
                        id: userId,
                        username: currentUser!.username,
                        securityTier: currentUser!.security_tier,
                    },
                    message: conversationRequest.message,
                    createdAt: conversationRequest.created_at,
                },
            });

            fastify.log.info({
                requestId,
                fromUserId: userId,
                toUserId: targetUser.id,
            }, 'Conversation request created');

            return { success: true, request: conversationRequest };
        }
    );

    /**
     * Get received conversation requests
     * GET /api/v2/conversation-requests/received
     */
    fastify.get(
        '/api/v2/conversation-requests/received',
        {
            preHandler: fastify.authenticate as any,
        },
        async (request) => {
            const userId = (request.user as any).sub as string;
            const requests = await db.getPendingRequestsForUser(userId);
            return { requests };
        }
    );

    /**
     * Get sent conversation requests
     * GET /api/v2/conversation-requests/sent
     */
    fastify.get(
        '/api/v2/conversation-requests/sent',
        {
            preHandler: fastify.authenticate as any,
        },
        async (request) => {
            const userId = (request.user as any).sub as string;
            const requests = await db.getSentRequestsForUser(userId);
            return { requests };
        }
    );

    /**
     * Accept a conversation request
     * POST /api/v2/conversation-requests/:requestId/accept
     */
    fastify.post<{ Params: { requestId: string } }>(
        '/api/v2/conversation-requests/:requestId/accept',
        {
            preHandler: fastify.authenticate as any,
        },
        async (request, reply) => {
            const userId = (request.user as any).sub as string;
            const { requestId } = request.params;

            const req = await db.getConversationRequestById(requestId);
            if (!req) {
                reply.code(404);
                return { error: 'Demande introuvable' };
            }

            if (req.to_user_id !== userId) {
                reply.code(403);
                return { error: 'Non autorisé' };
            }

            if (req.status !== 'pending') {
                reply.code(400);
                return { error: 'Cette demande a déjà été traitée' };
            }

            // Create the conversation
            const convoId = randomUUID();
            const conversation = await db.createConversation(convoId, [req.from_user_id, userId]);

            // Update the request status
            await db.updateRequestStatus(requestId, 'accepted', convoId);

            // Get participant details
            const fromUser = await db.getUserById(req.from_user_id);
            const toUser = await db.getUserById(userId);

            // Notify both users
            const members = [req.from_user_id, userId];
            (fastify as any).broadcast(members, {
                type: 'conversation_request_accepted',
                requestId,
                conversation: {
                    id: conversation.id,
                    createdAt: conversation.created_at,
                    participants: [
                        { id: fromUser!.id, username: fromUser!.username },
                        { id: toUser!.id, username: toUser!.username },
                    ],
                },
            });

            fastify.log.info({
                requestId,
                conversationId: convoId,
                fromUserId: req.from_user_id,
                toUserId: userId,
            }, 'Conversation request accepted');

            return {
                success: true,
                conversation: {
                    id: conversation.id,
                    createdAt: conversation.created_at,
                }
            };
        }
    );

    /**
     * Reject a conversation request
     * POST /api/v2/conversation-requests/:requestId/reject
     */
    fastify.post<{ Params: { requestId: string } }>(
        '/api/v2/conversation-requests/:requestId/reject',
        {
            preHandler: fastify.authenticate as any,
        },
        async (request, reply) => {
            const userId = (request.user as any).sub as string;
            const { requestId } = request.params;

            const req = await db.getConversationRequestById(requestId);
            if (!req) {
                reply.code(404);
                return { error: 'Demande introuvable' };
            }

            if (req.to_user_id !== userId) {
                reply.code(403);
                return { error: 'Non autorisé' };
            }

            if (req.status !== 'pending') {
                reply.code(400);
                return { error: 'Cette demande a déjà été traitée' };
            }

            await db.updateRequestStatus(requestId, 'rejected');

            // Notify the sender
            (fastify as any).broadcast([req.from_user_id], {
                type: 'conversation_request_rejected',
                requestId,
            });

            fastify.log.info({
                requestId,
                fromUserId: req.from_user_id,
                toUserId: userId,
            }, 'Conversation request rejected');

            return { success: true };
        }
    );
}
