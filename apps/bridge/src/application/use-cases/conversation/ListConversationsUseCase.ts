/**
 * List Conversations Use Case - Application Layer
 */

import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { Conversation } from '../../../domain/entities/Conversation';
import type { Message } from '../../../domain/entities/Message';
import type { User } from '../../../domain/entities/User';

export interface ConversationSummary {
  id: string;
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  otherParticipant: {
    id: string;
    username: string;
  };
}

export interface ListConversationsInput {
  userId: string;
}

export interface ListConversationsOutput {
  conversations: ConversationSummary[];
}

export class ListConversationsUseCase {
  constructor(
    private readonly conversationRepository: IConversationRepository,
    private readonly messageRepository: IMessageRepository,
    private readonly userRepository: IUserRepository
  ) {}

  async execute(input: ListConversationsInput): Promise<ListConversationsOutput> {
    // 1. Récupérer toutes les conversations de l'utilisateur
    const conversations = await this.conversationRepository.findByUserId(input.userId);

    // 2. Pour chaque conversation, récupérer les infos additionnelles
    const summaries: ConversationSummary[] = [];

    for (const conversation of conversations) {
      // 2.1 Trouver l'autre participant
      const otherParticipantId = conversation.getOtherParticipant(input.userId);
      const otherParticipant = await this.userRepository.findById(otherParticipantId);
      
      if (!otherParticipant) {
        // Skip si l'utilisateur n'existe plus
        continue;
      }

      // 2.2 Récupérer le dernier message
      const messages = await this.messageRepository.findByConversationId(conversation.id, {
        limit: 1,
      });
      const lastMessage = messages[0];

      summaries.push({
        id: conversation.id,
        createdAt: conversation.createdAt,
        lastMessageAt: lastMessage?.createdAt,
        lastMessagePreview: lastMessage?.body,
        otherParticipant: {
          id: otherParticipant.id,
          username: otherParticipant.username,
        },
      });
    }

    // 3. Trier par dernière activité (plus récent en premier)
    summaries.sort((a, b) => {
      const aTime = a.lastMessageAt ?? a.createdAt;
      const bTime = b.lastMessageAt ?? b.createdAt;
      return bTime - aTime;
    });

    return { conversations: summaries };
  }
}
