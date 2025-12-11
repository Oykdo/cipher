/**
 * Acknowledge Message Use Case - Application Layer
 * 
 * Gère l'accusé de réception et Burn After Reading
 */

import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import { MessageNotFoundError, MessageAlreadyAcknowledgedError, NotConversationParticipantError } from '../../../domain/errors';
import type { Message } from '../../../domain/entities/Message';

export interface AcknowledgeMessageInput {
  messageId: string;
  conversationId: string;
  userId: string; // User who acknowledges (recipient)
  burnDuration?: number; // Duration in ms before burn (if burn_after_reading)
}

export interface AcknowledgeMessageOutput {
  success: boolean;
  willBurnAt?: number;
}

export class AcknowledgeMessageUseCase {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly conversationRepository: IConversationRepository
  ) {}

  async execute(input: AcknowledgeMessageInput): Promise<AcknowledgeMessageOutput> {
    // 1. Trouver le message
    const message = await this.messageRepository.findById(input.messageId);
    if (!message) {
      throw new MessageNotFoundError(input.messageId);
    }

    // 2. Vérifier que l'utilisateur est le destinataire (pas l'expéditeur)
    const conversation = await this.conversationRepository.findById(message.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found for message');
    }

    if (!conversation.hasParticipant(input.userId)) {
      throw new NotConversationParticipantError(message.conversationId, input.userId);
    }

    if (message.senderId === input.userId) {
      throw new Error('Sender cannot acknowledge their own message');
    }

    // 3. Vérifier que le message n'a pas déjà été ack
    if (message.ackAt) {
      throw new MessageAlreadyAcknowledgedError(input.messageId);
    }

    // 4. Acknowledge le message
    const acknowledgedMessage = message.acknowledge(input.burnDuration);

    // 5. Persister
    await this.messageRepository.update(acknowledgedMessage);

    // 6. Retourner
    return {
      success: true,
      willBurnAt: acknowledgedMessage.willBurnAt,
    };
  }
}
