/**
 * Conversation Entity - Domain Layer
 *
 * Direct (1:1) and group (2-10 members, owner-only governance) live in the
 * same entity, discriminated by `type`. The 2-10 member-count constraint
 * for groups is enforced here at construction time and re-enforced at the
 * route layer (routes/groups.ts) — there is no SQL trigger.
 */

import { randomUUID } from 'crypto';

export type ConversationType = 'direct' | 'group';

export const GROUP_MIN_MEMBERS = 2;
export const GROUP_MAX_MEMBERS = 10;

export interface ConversationProps {
  id: string;
  type: ConversationType;
  participants: string[];
  createdBy: string | null;
  encryptedTitle?: string | null;
  createdAt: number;
  lastMessageAt?: number;
}

export class Conversation {
  private constructor(private readonly props: ConversationProps) {
    this.validate();
  }

  // ============================================================================
  // Getters
  // ============================================================================
  get id(): string {
    return this.props.id;
  }
  get type(): ConversationType {
    return this.props.type;
  }
  get participants(): string[] {
    return this.props.participants;
  }
  get createdBy(): string | null {
    return this.props.createdBy;
  }
  get encryptedTitle(): string | null | undefined {
    return this.props.encryptedTitle;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get lastMessageAt(): number | undefined {
    return this.props.lastMessageAt;
  }

  // ============================================================================
  // Factories
  // ============================================================================
  static createDirect(participant1: string, participant2: string): Conversation {
    return new Conversation({
      id: randomUUID(),
      type: 'direct',
      participants: [participant1, participant2],
      createdBy: null,
      encryptedTitle: null,
      createdAt: Date.now(),
    });
  }

  /** @deprecated use createDirect() — kept for transitional use-case layer compat. */
  static create(participant1: string, participant2: string): Conversation {
    return Conversation.createDirect(participant1, participant2);
  }

  static createGroup(opts: {
    creatorId: string;
    memberIds: string[];
    encryptedTitle?: string | null;
  }): Conversation {
    const memberSet = new Set(opts.memberIds);
    memberSet.add(opts.creatorId);
    const participants = Array.from(memberSet);
    return new Conversation({
      id: randomUUID(),
      type: 'group',
      participants,
      createdBy: opts.creatorId,
      encryptedTitle: opts.encryptedTitle ?? null,
      createdAt: Date.now(),
    });
  }

  static fromRow(row: {
    id: string;
    type?: ConversationType | null;
    created_by?: string | null;
    encrypted_title?: string | null;
    created_at: number;
    last_message_at?: number;
    member_ids: string[];
  }): Conversation {
    return new Conversation({
      id: row.id,
      type: row.type ?? 'direct',
      participants: row.member_ids,
      createdBy: row.created_by ?? null,
      encryptedTitle: row.encrypted_title ?? null,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
    });
  }

  // ============================================================================
  // Business methods
  // ============================================================================
  isGroup(): boolean {
    return this.props.type === 'group';
  }

  isDirect(): boolean {
    return this.props.type === 'direct';
  }

  isOwner(userId: string): boolean {
    return this.props.createdBy === userId;
  }

  hasParticipant(userId: string): boolean {
    return this.props.participants.includes(userId);
  }

  /**
   * Returns the other participant in a direct conversation. Throws on
   * groups — callers should use `participants` and filter by current user.
   */
  getOtherParticipant(userId: string): string {
    if (this.isGroup()) {
      throw new Error('getOtherParticipant() is only valid for direct conversations');
    }
    if (!this.hasParticipant(userId)) {
      throw new Error('User is not a participant in this conversation');
    }
    return this.props.participants.find((p) => p !== userId)!;
  }

  updateLastMessageAt(timestamp: number): Conversation {
    return new Conversation({
      ...this.props,
      lastMessageAt: timestamp,
    });
  }

  // ============================================================================
  // Validation
  // ============================================================================
  private validate(): void {
    if (!this.props.id) {
      throw new Error('Conversation ID is required');
    }
    const n = this.props.participants.length;
    if (new Set(this.props.participants).size !== n) {
      throw new Error('Conversation participants must be unique');
    }
    if (this.props.type === 'direct') {
      if (n !== 2) {
        throw new Error('Direct conversation must have exactly 2 participants');
      }
      if (this.props.participants[0] === this.props.participants[1]) {
        throw new Error('Conversation participants must be different');
      }
    } else if (this.props.type === 'group') {
      if (n < GROUP_MIN_MEMBERS || n > GROUP_MAX_MEMBERS) {
        throw new Error(
          `Group conversation must have between ${GROUP_MIN_MEMBERS} and ${GROUP_MAX_MEMBERS} participants`,
        );
      }
      if (!this.props.createdBy) {
        throw new Error('Group conversation must have an owner (createdBy)');
      }
      if (!this.props.participants.includes(this.props.createdBy)) {
        throw new Error('Group owner must be a participant');
      }
    } else {
      throw new Error(`Unknown conversation type: ${this.props.type as string}`);
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      participants: this.participants,
      createdBy: this.createdBy,
      encryptedTitle: this.encryptedTitle,
      createdAt: this.createdAt,
      lastMessageAt: this.lastMessageAt,
    };
  }
}
