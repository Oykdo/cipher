/**
 * Message Repository Interface - Domain Layer
 */

import type { Message } from '../entities/Message';

export interface IMessageRepository {
  /**
   * Trouver un message par ID
   */
  findById(id: string): Promise<Message | null>;

  /**
   * Créer un nouveau message
   */
  create(message: Message): Promise<void>;

  /**
   * Mettre à jour un message
   */
  update(message: Message): Promise<void>;

  /**
   * Supprimer un message
   */
  delete(id: string): Promise<void>;

  /**
   * Lister les messages d'une conversation
   */
  findByConversationId(
    conversationId: string,
    options?: {
      before?: number;
      limit?: number;
    }
  ): Promise<Message[]>;

  /**
   * Trouver les messages time-locked
   */
  findTimeLocked(): Promise<Message[]>;

  /**
   * Trouver les messages scheduled burn
   */
  findScheduledBurns(before?: number): Promise<Message[]>;

  /**
   * Burn a message
   */
  burn(messageId: string): Promise<void>;

  /**
   * Schedule burn for a message
   */
  scheduleBurn(messageId: string, scheduledAt: number): Promise<void>;

  /**
   * Get last message in conversation
   */
  getLastMessage(conversationId: string): Promise<Message | null>;

  /**
   * Find messages to burn (burn after read expired)
   */
  findMessagesToBurn(now: number): Promise<Message[]>;

  /**
   * Delete burned messages
   */
  deleteBurnedMessages(messageIds: string[]): Promise<void>;

  /**
   * Find locked messages that can be unlocked
   */
  findLockedMessages(now: number): Promise<Message[]>;
}
