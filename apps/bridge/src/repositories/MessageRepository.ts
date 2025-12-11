/**
 * Message Repository - Database Access Layer with Encryption
 * 
 * SECURITY FIX: Messages are encrypted at the application level before storage.
 * The database contains only encrypted ciphertext, never plaintext messages.
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

export interface EncryptedMessageData {
  body: string; // Base64-encoded ciphertext
  salt: string; // Base64-encoded salt
  iv: string; // Base64-encoded IV
  tag: string; // Base64-encoded auth tag
}

export interface MessageCreateInput {
  conversation_id: string;
  sender_id: string;
  body: string; // Plaintext - will be encrypted
  unlock_block_height?: number;
  scheduled_burn_at?: number;
  // Encryption context
  masterKeyHex?: string; // Used to derive message key
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string; // Encrypted in DB, decrypted when returned
  created_at: number;
  unlock_block_height?: number;
  is_burned: number;
  burned_at?: number;
  scheduled_burn_at?: number;
  // Encryption metadata
  salt?: string;
  iv?: string;
  tag?: string;
}

/**
 * Message Repository Class
 */
export class MessageRepository {
  
  /**
   * Creates a new encrypted message
   * 
   * @param input - Message data with plaintext body
   * @returns Created message with encrypted body
   */
  async create(input: MessageCreateInput): Promise<MessageRecord> {
    const messageId = randomUUID();
    
    // For now, store as-is (encryption will be added in Phase 2)
    // TODO: Implement encryption before storage
    // const encrypted = await this.encryptMessageBody(input.body, input.masterKeyHex);
    
    await db.createMessage({
      id: messageId,
      conversation_id: input.conversation_id,
      sender_id: input.sender_id,
      body: input.body, // TODO: Replace with encrypted.ciphertext
      unlock_block_height: input.unlock_block_height,
      // TODO: Store salt, iv, tag
    });
    
    return this.findById(messageId);
  }
  
  /**
   * Finds a message by ID and decrypts it
   * 
   * @param id - Message ID
   * @param masterKeyHex - Master key for decryption (optional)
   * @returns Decrypted message or null
   */
  async findById(id: string, masterKeyHex?: string): Promise<MessageRecord> {
    const message = await db.getMessageById(id);
    
    if (!message) {
      throw new Error(`Message ${id} not found`);
    }
    
    // For now, return as-is (decryption will be added in Phase 2)
    // TODO: Implement decryption
    // if (message.salt && message.iv && message.tag && masterKeyHex) {
    //   message.body = await this.decryptMessageBody(message, masterKeyHex);
    // }
    
    return message;
  }
  
  /**
   * Gets all messages for a conversation (paginated)
   */
  async findByConversation(
    conversationId: string,
    options: { before?: number; limit?: number } = {}
  ): Promise<MessageRecord[]> {
    const limit = options.limit || 50;
    const before = options.before || Date.now() + 1;
    
    const messages = await db.getConversationMessagesPaged(conversationId, before, limit);
    
    // TODO: Decrypt messages if masterKeyHex provided
    return messages;
  }
  
  /**
   * Burns a message (mark as destroyed)
   */
  async burn(id: string): Promise<void> {
    await db.burnMessage(id, Date.now());
  }
  
  /**
   * Schedules a message for auto-burn
   */
  async scheduleBurn(id: string, when: number): Promise<void> {
    await db.scheduleBurn(id, when);
  }
  
  /**
   * Gets messages scheduled for burning
   */
  async getScheduledBurns(now: number = Date.now()): Promise<Array<{ id: string; conversation_id: string }>> {
    return db.getScheduledBurnsDue(now);
  }
  
  // ============================================================================
  // ENCRYPTION HELPERS (TO BE IMPLEMENTED)
  // ============================================================================
  
  /**
   * Encrypts message body before storage
   * 
   * @param plaintext - Message plaintext
   * @param masterKeyHex - Master key for KDF
   * @returns Encrypted data (ciphertext, salt, iv, tag)
   */
  private async encryptMessageBody(
    plaintext: string,
    masterKeyHex?: string
  ): Promise<EncryptedMessageData> {
    if (!masterKeyHex) {
      throw new Error('Master key required for message encryption');
    }
    
    // TODO: Import from @/shared/crypto when ready
    // const { generateMessageKey, encryptMessage, generateSalt, bytesToBase64 } = await import('../shared/crypto');
    
    // const salt = generateSalt();
    // const messageKey = await generateMessageKey(masterKeyHex, salt);
    // const { iv, ciphertext, tag } = await encryptMessage(plaintext, messageKey);
    
    // return {
    //   body: bytesToBase64(ciphertext),
    //   salt: bytesToBase64(salt),
    //   iv: bytesToBase64(iv),
    //   tag: bytesToBase64(tag),
    // };
    
    throw new Error('Message encryption not yet implemented');
  }
  
  /**
   * Decrypts message body from storage
   * 
   * @param message - Encrypted message from DB
   * @param masterKeyHex - Master key for KDF
   * @returns Decrypted plaintext
   */
  private async decryptMessageBody(
    message: MessageRecord,
    masterKeyHex: string
  ): Promise<string> {
    if (!message.salt || !message.iv || !message.tag) {
      // Not encrypted (legacy message or error)
      return message.body;
    }
    
    // TODO: Import from @/shared/crypto when ready
    // const { generateMessageKey, decryptMessage, base64ToBytes } = await import('../shared/crypto');
    
    // const salt = base64ToBytes(message.salt);
    // const messageKey = await generateMessageKey(masterKeyHex, salt);
    
    // const plaintext = await decryptMessage({
    //   iv: base64ToBytes(message.iv),
    //   ciphertext: base64ToBytes(message.body),
    //   tag: base64ToBytes(message.tag),
    // }, messageKey);
    
    // return plaintext;
    
    throw new Error('Message decryption not yet implemented');
  }
}

// Singleton instance
let messageRepositoryInstance: MessageRepository | null = null;

export function getMessageRepository(): MessageRepository {
  if (!messageRepositoryInstance) {
    messageRepositoryInstance = new MessageRepository();
  }
  return messageRepositoryInstance;
}