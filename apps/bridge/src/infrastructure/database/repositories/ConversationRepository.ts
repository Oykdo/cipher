/**
 * Conversation Repository Implementation - Infrastructure Layer
 */

import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import type { Conversation } from '../../../domain/entities/Conversation';
import type { DatabaseService } from '../../../db/database';
import { Conversation as ConversationEntity } from '../../../domain/entities/Conversation';

export class ConversationRepository implements IConversationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<Conversation | null> {
    const row = await this.db.getConversationById(id);
    if (!row) {return null;}

    const memberIds = await this.db.getConversationMembers(id);

    return ConversationEntity.fromRow({
      id: row.id,
      created_at: row.created_at,
      last_message_id: row.last_message_id || undefined,
      last_message_at: row.last_message_at || undefined,
      member_ids: memberIds,
    });
  }

  async findByParticipants(userIds: [string, string]): Promise<Conversation | null> {
    // Get all conversations for first user
    const conversations = await this.findByUserId(userIds[0]);
    
    // Find conversation that includes both users
    for (const conversation of conversations) {
      const members = await this.getMembers(conversation.id);
      if (members.includes(userIds[1])) {
        return conversation;
      }
    }

    return null;
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    const rows = await this.db.getUserConversations(userId);
    const conversations: Conversation[] = [];

    for (const row of rows) {
      const memberIds = await this.db.getConversationMembers(row.id);
      conversations.push(
        ConversationEntity.fromRow({
          id: row.id,
          created_at: row.created_at,
          last_message_id: row.last_message_id || undefined,
          last_message_at: row.last_message_at || undefined,
          participants: memberIds.join(','), // Convert array to comma-separated string
        })
      );
    }

    return conversations;
  }

  async create(conversation: Conversation): Promise<void> {
    // Get participants from the conversation entity
    const members = conversation.participants;
    if (members.length !== 2) {
      throw new Error('Conversation must have exactly 2 members');
    }

    await this.db.createConversation(conversation.id, members);
  }

  async update(conversation: Conversation): Promise<void> {
    // TODO: Implement update logic for last_message_id, last_message_at
    throw new Error('ConversationRepository.update not implemented yet');
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement delete logic
    throw new Error('ConversationRepository.delete not implemented yet');
  }

  async getMembers(conversationId: string): Promise<string[]> {
    return await this.db.getConversationMembers(conversationId);
  }

  async addMember(conversationId: string, userId: string): Promise<void> {
    // TODO: Current schema only supports 2 members
    // This would require schema changes for group chats
    throw new Error('Adding members not supported (2-member limit)');
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    // TODO: Implement remove member
    throw new Error('ConversationRepository.removeMember not implemented yet');
  }

  async exists(id: string): Promise<boolean> {
    return this.db.conversationExists(id);
  }
}
