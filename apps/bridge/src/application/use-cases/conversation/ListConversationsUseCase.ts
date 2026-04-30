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
  type: 'direct' | 'group';
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  members: Array<{ id: string; username: string }>;
  memberCount: number;
  createdBy: string | null;
  encryptedTitle?: string | null;
  /** Convenience field for direct conversations only (undefined for groups). */
  otherParticipant?: {
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
      // 2.1 Resolve every member to { id, username }
      const memberRecords = await Promise.all(
        conversation.participants.map((id) => this.userRepository.findById(id)),
      );
      const members = memberRecords
        .filter((u): u is User => !!u)
        .map((u) => ({ id: u.id, username: u.username }));

      // For direct conversations, surface the other side as a convenience
      // so the frontend doesn't have to filter the array on every render.
      let otherParticipant: { id: string; username: string } | undefined;
      if (conversation.isDirect()) {
        const peer = members.find((m) => m.id !== input.userId);
        if (!peer) continue; // The peer's account vanished — skip the row.
        otherParticipant = peer;
      }

      // 2.2 Récupérer le dernier message
      const messages = await this.messageRepository.findByConversationId(conversation.id, {
        limit: 1,
      });
      const lastMessage = messages[0];

      summaries.push({
        id: conversation.id,
        type: conversation.type,
        createdAt: conversation.createdAt,
        lastMessageAt: lastMessage?.createdAt,
        lastMessagePreview: lastMessage?.body,
        members,
        memberCount: members.length,
        createdBy: conversation.createdBy,
        encryptedTitle: conversation.encryptedTitle ?? null,
        otherParticipant,
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
