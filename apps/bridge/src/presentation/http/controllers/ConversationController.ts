/**
 * Conversation Controller - Presentation Layer
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateConversationUseCase } from '../../../application/use-cases/conversation/CreateConversationUseCase';
import type { ListConversationsUseCase } from '../../../application/use-cases/conversation/ListConversationsUseCase';
import {
  CreateConversationRequestSchema,
  type CreateConversationResponse,
  type ListConversationsResponse,
  type GetConversationResponse,
} from '../dtos/conversation.dto';

export class ConversationController {
  constructor(
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly listConversationsUseCase: ListConversationsUseCase
  ) {}

  /**
   * POST /conversations
   * Create a new conversation with a target user
   */
  async create(request: FastifyRequest): Promise<CreateConversationResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;

    // Validate input
    const input = CreateConversationRequestSchema.parse(request.body);

    // Execute use case
    const result = await this.createConversationUseCase.execute({
      initiatorId: userId,
      targetUsername: input.targetUsername,
    });

    // Return response
    return {
      id: result.conversation.id,
      createdAt: result.conversation.createdAt,
      participants: result.participants.map((p) => ({
        id: p.id,
        username: p.username,
      })),
    };
  }

  /**
   * GET /conversations
   * List all conversations for authenticated user
   */
  async list(request: FastifyRequest): Promise<ListConversationsResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;

    // Execute use case
    const result = await this.listConversationsUseCase.execute({ userId });

    // Return response
    return {
      conversations: result.conversations.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        otherParticipant: {
          id: c.otherParticipant.id,
          username: c.otherParticipant.username,
        },
      })),
    };
  }

  /**
   * GET /conversations/:id
   * Get conversation details
   */
  async getById(
    request: FastifyRequest<{ Params: { id: string } }>
  ): Promise<GetConversationResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;
    const conversationId = request.params.id;

    // TODO: Implement GetConversationUseCase
    throw new Error('GetConversationUseCase not implemented yet');
  }
}
