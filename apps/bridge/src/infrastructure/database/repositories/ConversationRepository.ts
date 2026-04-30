/**
 * Conversation Repository Implementation - Infrastructure Layer
 *
 * Bridges the domain Conversation entity to the persistence layer
 * (`database.js`). Handles direct (1:1) and group (2-10) conversations
 * uniformly — the entity's `type` field discriminates.
 */

import type { IConversationRepository } from '../../../domain/repositories/IConversationRepository';
import type { Conversation } from '../../../domain/entities/Conversation';
import type { DatabaseService } from '../../../db/database';
import { Conversation as ConversationEntity } from '../../../domain/entities/Conversation';

export class ConversationRepository implements IConversationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<Conversation | null> {
    const row = await this.db.getConversationById(id);
    if (!row) return null;

    const memberIds = await this.db.getConversationMembers(id);

    return ConversationEntity.fromRow({
      id: row.id,
      type: row.type ?? 'direct',
      created_by: row.created_by ?? null,
      encrypted_title: row.encrypted_title ?? null,
      created_at: row.created_at,
      last_message_at: row.last_message_at || undefined,
      member_ids: memberIds,
    });
  }

  /**
   * Find a direct conversation between two specific users. Group
   * conversations linking the same two users are intentionally NOT
   * returned — direct dedup must not collide with group membership.
   */
  async findDirectByParticipants(
    userIds: [string, string],
  ): Promise<Conversation | null> {
    const conversations = await this.findByUserId(userIds[0]);
    for (const conversation of conversations) {
      if (!conversation.isDirect()) continue;
      if (conversation.participants.includes(userIds[1])) {
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
          type: row.type ?? 'direct',
          created_by: row.created_by ?? null,
          encrypted_title: row.encrypted_title ?? null,
          created_at: row.created_at,
          last_message_at: row.last_message_at || undefined,
          member_ids: memberIds,
        }),
      );
    }

    return conversations;
  }

  async create(conversation: Conversation): Promise<void> {
    await this.db.createConversation(conversation.id, conversation.participants, {
      type: conversation.type,
      createdBy: conversation.createdBy,
      encryptedTitle: conversation.encryptedTitle ?? null,
    });
  }

  async update(conversation: Conversation): Promise<void> {
    if (conversation.isGroup() && conversation.encryptedTitle !== undefined) {
      await this.db.updateConversationEncryptedTitle(
        conversation.id,
        conversation.encryptedTitle,
      );
    }
    // last_message_at is maintained server-side by message inserts; no other
    // field on Conversation requires a write path today.
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteConversation(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.db.conversationExists(id);
  }

  async getMembers(conversationId: string): Promise<string[]> {
    return await this.db.getConversationMembers(conversationId);
  }

  async addMember(conversationId: string, userId: string): Promise<void> {
    const conv = await this.findById(conversationId);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (!conv.isGroup()) {
      throw new Error('addMember is only valid on group conversations');
    }
    const count = await this.db.countConversationMembers(conversationId);
    if (count >= 10) {
      throw new Error('Group conversation already has the maximum of 10 members');
    }
    await this.db.addConversationMember(conversationId, userId);
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    const conv = await this.findById(conversationId);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (!conv.isGroup()) {
      throw new Error('removeMember is only valid on group conversations');
    }
    if (conv.isOwner(userId)) {
      throw new Error('Cannot remove the group owner; delete the group instead');
    }
    await this.db.removeConversationMember(conversationId, userId);
  }
}
