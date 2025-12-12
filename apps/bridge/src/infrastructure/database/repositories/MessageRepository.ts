/**
 * Message Repository Implementation - Infrastructure Layer
 */

import type { IMessageRepository } from '../../../domain/repositories/IMessageRepository';
import type { Message } from '../../../domain/entities/Message';
import type { DatabaseService } from '../../../db/database';
import { Message as MessageEntity } from '../../../domain/entities/Message';

export class MessageRepository implements IMessageRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<Message | null> {
    const row = await this.db.getMessageById(id);
    if (!row) {return null;}

    return MessageEntity.fromRow({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      body: row.body,
      created_at: row.created_at,
      unlock_block_height: row.unlock_block_height || undefined,
      is_burned: row.is_burned === 1,
      burned_at: row.burned_at || undefined,
      scheduled_burn_at: row.scheduled_burn_at || undefined,
    });
  }

  async findByConversationId(
    conversationId: string,
    options?: { limit?: number; before?: number }
  ): Promise<Message[]> {
    let rows;

    if (options?.before) {
      rows = await this.db.getConversationMessagesPaged(
        conversationId,
        options.before,
        options.limit || 100
      );
    } else {
      rows = await this.db.getConversationMessages(conversationId, options?.limit || 100);
    }

    return rows.map((row: any) =>
      MessageEntity.fromRow({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        body: row.body,
        created_at: row.created_at,
        unlock_block_height: row.unlock_block_height || undefined,
        is_burned: row.is_burned === 1,
        burned_at: row.burned_at || undefined,
        scheduled_burn_at: row.scheduled_burn_at || undefined,
      })
    );
  }

  async findScheduledBurns(before?: number): Promise<Message[]> {
    const rows = await this.db.getScheduledBurnsDue(before || Date.now());
    const messages: Message[] = [];

    for (const row of rows) {
      const message = await this.findById(row.id);
      if (message) {messages.push(message);}
    }

    return messages;
  }

  async findTimeLocked(): Promise<Message[]> {
    // Not implemented in Postgres DatabaseService yet.
    // This repository is currently only used by the clean-architecture layer (not wired for v2 routes).
    return [];
  }

  async create(message: Message): Promise<void> {
    const row = message.toRow();

    this.db.createMessage({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      body: row.body,
      unlock_block_height: row.unlock_block_height || undefined,
      scheduled_burn_at: row.scheduled_burn_at,
    });
  }

  async update(message: Message): Promise<void> {
    // Handle burn state changes
    if (message.isBurned) {
      this.db.burnMessage(message.id, Date.now());
      return;
    }

    // Handle scheduled burn changes
    if (message.scheduledBurnAt) {
      this.db.scheduleBurn(message.id, message.scheduledBurnAt);
      return;
    }

    // TODO: Generic update not implemented
    throw new Error('MessageRepository.update not fully implemented');
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteMessage(id);
  }

  async burn(messageId: string): Promise<void> {
    this.db.burnMessage(messageId, Date.now());
  }

  async scheduleBurn(messageId: string, scheduledAt: number): Promise<void> {
    this.db.scheduleBurn(messageId, scheduledAt);
  }

  async getLastMessage(conversationId: string): Promise<Message | null> {
    const row = await this.db.getLastMessage(conversationId);
    if (!row) {return null;}

    return MessageEntity.fromRow({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      body: row.body,
      created_at: row.created_at,
      unlock_block_height: row.unlock_block_height || undefined,
      is_burned: row.is_burned === 1,
      burned_at: row.burned_at || undefined,
      scheduled_burn_at: row.scheduled_burn_at || undefined,
    });
  }

  async findMessagesToBurn(now: number): Promise<Message[]> {
    const rows = await this.db.getScheduledBurnsDue(now);
    const messages: Message[] = [];

    for (const row of rows) {
      const message = await this.findById(row.id);
      if (message) {messages.push(message);}
    }

    return messages;
  }

  async deleteBurnedMessages(messageIds: string[]): Promise<void> {
    for (const id of messageIds) {
      await this.delete(id);
    }
  }

  async findLockedMessages(now: number): Promise<Message[]> {
    // Find messages with unlock_block_height that should be unlocked
    // This requires blockchain height comparison
    // For now, return empty array - will be implemented with blockchain service
    return [];
  }
}
