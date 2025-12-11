/**
 * Create Conversation Use Case - Application Layer
 */

import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { Conversation } from '../../../domain/entities/Conversation';
import { UserNotFoundError, ConversationAlreadyExistsError } from '../../../domain/errors';

export interface CreateConversationInput {
  initiatorId: string; // User who creates the conversation
  targetUsername: string; // Target user to chat with
}

export interface CreateConversationOutput {
  conversation: Conversation;
  participants: Array<{ id: string; username: string }>;
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository,
    private readonly userRepository: IUserRepository
  ) {}

  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    // 1. Vérifier que l'utilisateur cible existe
    const targetUser = await this.userRepository.findByUsername(input.targetUsername);
    if (!targetUser) {
      throw new UserNotFoundError(input.targetUsername);
    }

    // 2. Vérifier que l'initiateur existe
    const initiator = await this.userRepository.findById(input.initiatorId);
    if (!initiator) {
      throw new UserNotFoundError(input.initiatorId);
    }

    // 3. Vérifier qu'on ne crée pas une conversation avec soi-même
    if (targetUser.id === input.initiatorId) {
      throw new Error('Cannot create conversation with yourself');
    }

    // 4. Vérifier si la conversation existe déjà
    const existing = await this.conversationRepository.findByParticipants([
      input.initiatorId,
      targetUser.id,
    ]);
    if (existing) {
      // Return existing conversation instead of throwing
      return {
        conversation: existing,
        participants: [
          { id: initiator.id, username: initiator.username },
          { id: targetUser.id, username: targetUser.username },
        ],
      };
    }

    // 5. Créer la conversation
    const conversation = Conversation.create(input.initiatorId, targetUser.id);

    // 6. Persister
    await this.conversationRepository.create(conversation);

    // 7. Retourner
    return {
      conversation,
      participants: [
        { id: initiator.id, username: initiator.username },
        { id: targetUser.id, username: targetUser.username },
      ],
    };
  }
}
