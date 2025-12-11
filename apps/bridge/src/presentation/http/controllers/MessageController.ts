/**
 * Message Controller - Presentation Layer
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SendMessageUseCase } from '../../../application/use-cases/message/SendMessageUseCase';
import type { AcknowledgeMessageUseCase } from '../../../application/use-cases/message/AcknowledgeMessageUseCase';
import {
  SendMessageRequestSchema,
  GetMessagesQuerySchema,
  AcknowledgeMessageRequestSchema,
  BurnMessageRequestSchema,
  type SendMessageResponse,
  type GetMessagesResponse,
  type AcknowledgeMessageResponse,
  type BurnMessageResponse,
} from '../dtos/message.dto';

export class MessageController {
  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly acknowledgeMessageUseCase: AcknowledgeMessageUseCase
  ) {}

  /**
   * POST /conversations/:conversationId/messages
   * Send a new message in a conversation
   */
  async send(
    request: FastifyRequest<{ Params: { conversationId: string } }>
  ): Promise<SendMessageResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;
    const conversationId = request.params.conversationId;

    // Validate input
    const input = SendMessageRequestSchema.parse(request.body);

    // Execute use case
    const result = await this.sendMessageUseCase.execute({
      conversationId,
      senderId: userId,
      body: input.body,
      unlockBlockHeight: input.unlockBlockHeight,
      scheduledBurnAt: input.scheduledBurnAt,
    });

    // Return response (Message entity has all these properties now)
    return result as SendMessageResponse;
  }

  /**
   * GET /conversations/:conversationId/messages
   * Get messages for a conversation (paginated)
   */
  async list(
    request: FastifyRequest<{
      Params: { conversationId: string };
      Querystring: Record<string, string>;
    }>
  ): Promise<GetMessagesResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;
    const conversationId = request.params.conversationId;

    // Validate query params
    const query = GetMessagesQuerySchema.parse(request.query);

    // TODO: Implement GetMessagesUseCase
    throw new Error('GetMessagesUseCase not implemented yet');
  }

  /**
   * POST /conversations/:conversationId/messages/:messageId/acknowledge
   * Mark message as read (for burn-after-reading)
   */
  async acknowledge(
    request: FastifyRequest<{
      Params: { conversationId: string; messageId: string };
    }>
  ): Promise<AcknowledgeMessageResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;
    const { conversationId, messageId } = request.params;

    // Execute use case
    const result = await this.acknowledgeMessageUseCase.execute({
      messageId,
      conversationId,
      userId,
    });

    // Return response
    return result;
  }

  /**
   * POST /conversations/:conversationId/messages/:messageId/burn
   * Manually burn a message
   */
  async burn(
    request: FastifyRequest<{
      Params: { conversationId: string; messageId: string };
    }>
  ): Promise<BurnMessageResponse> {
    // Get authenticated user from JWT
    const userId = (request.user as any).id;
    const { conversationId, messageId } = request.params;

    // TODO: Implement BurnMessageUseCase (exists: BurnMessagesUseCase)
    throw new Error('Manual burn not implemented yet');
  }
}
