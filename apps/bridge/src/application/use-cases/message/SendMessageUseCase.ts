/**
 * Send Message Use Case - Application Layer
 */

import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { Message } from '../../../domain/entities/Message';
import {
  ConversationNotFoundError,
  NotConversationParticipantError,
  InsufficientReputationError,
  InvalidUnlockHeightError,
} from '../../../domain/errors';

export interface SendMessageInput {
  senderId: string;
  conversationId: string;
  body: string;
  unlockBlockHeight?: number;
  scheduledBurnAt?: number;
}

export interface SendMessageOutput extends Message {}

export class SendMessageUseCase {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly conversationRepository: IConversationRepository
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    // 1. Vérifier que la conversation existe
    const conversation = await this.conversationRepository.findById(input.conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }

    // 2. Vérifier que l'utilisateur est un participant
    if (!conversation.hasParticipant(input.senderId)) {
      throw new NotConversationParticipantError(input.conversationId, input.senderId);
    }

    // 3. Créer le message
    const message = Message.create({
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: input.body,
      unlockBlockHeight: input.unlockBlockHeight,
      scheduledBurnAt: input.scheduledBurnAt,
    });

    // 4. Persister
    await this.messageRepository.create(message);

    // 5. Mettre à jour lastMessageAt de la conversation
    // TODO: Implement updateLastMessageAt in Conversation entity
    // const updatedConversation = conversation.updateLastMessageAt(message.createdAt);
    // await this.conversationRepository.update(updatedConversation);

    // 6. Retourner
    return message;
  }
}
