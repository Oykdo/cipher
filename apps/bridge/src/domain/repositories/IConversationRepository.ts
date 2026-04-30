/**
 * Conversation Repository Interface - Domain Layer
 *
 * Direct (1:1) and group (2-10 members) conversations are unified behind
 * a single repository. Implementations enforce 2-10 for groups and 2 for
 * direct via the entity validation and via DB-level guards.
 */

import type { Conversation } from '../entities/Conversation';

export interface IConversationRepository {
  /** Find a conversation by ID (works for both direct and group). */
  findById(id: string): Promise<Conversation | null>;

  /**
   * Find a *direct* conversation between two users. Returns null if either
   * (a) no conversation exists between them, or (b) only group conversations
   * link them. Use this to dedupe direct-conversation creation requests.
   */
  findDirectByParticipants(userIds: [string, string]): Promise<Conversation | null>;

  /** List all conversations a user belongs to (direct + group). */
  findByUserId(userId: string): Promise<Conversation[]>;

  /** Persist a new conversation. */
  create(conversation: Conversation): Promise<void>;

  /** Update mutable fields (last_message_id, last_message_at, encrypted_title). */
  update(conversation: Conversation): Promise<void>;

  /** Delete a conversation (cascade via FKs removes members + messages). */
  delete(id: string): Promise<void>;

  /** Cheap existence check used by middleware. */
  exists(id: string): Promise<boolean>;

  // ============================================================================
  // Membership management
  // ============================================================================
  /** List all member user IDs of a conversation (direct or group). */
  getMembers(conversationId: string): Promise<string[]>;

  /**
   * Add a member to a group. Implementations enforce the 10-member cap and
   * refuse on direct conversations.
   */
  addMember(conversationId: string, userId: string): Promise<void>;

  /**
   * Remove a member from a group. Implementations refuse if userId is the
   * owner (use delete() to dissolve the group) and refuse on direct.
   */
  removeMember(conversationId: string, userId: string): Promise<void>;
}
