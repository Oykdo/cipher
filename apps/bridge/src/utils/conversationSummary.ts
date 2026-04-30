/**
 * Shared conversation-summary builder used by routes/conversations.ts
 * and routes/groups.ts. Centralises the augmented response shape so
 * frontend types only have one source of truth on the bridge side.
 */

import { getDatabase } from '../db/database.js';

const db = getDatabase();

export interface ConversationMember {
  id: string;
  username: string;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  type: 'direct' | 'group';
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  members: ConversationMember[];
  memberCount: number;
  createdBy: string | null;
  encryptedTitle: string | null;
  /** Convenience field for direct conversations only. */
  otherParticipant?: ConversationMember;
}

/**
 * Build the augmented conversation summary for a single row, resolving
 * member usernames and last-message metadata. Returns null if the
 * conversation has no resolvable members or is a direct conversation
 * whose peer's account vanished.
 */
export async function buildConversationSummary(
  convo: any,
  currentUserId: string,
): Promise<ConversationSummary | null> {
  if (!convo || !convo.id) return null;

  const memberIds = await db.getConversationMembers(convo.id);
  const members: ConversationMember[] = [];
  for (const memberId of memberIds) {
    const user = await db.getUserById(memberId);
    if (user) members.push({ id: user.id, username: user.username });
  }
  if (members.length === 0) return null;

  const type: 'direct' | 'group' = convo.type === 'group' ? 'group' : 'direct';

  let lastMessage: ConversationMessageRecord | null = null;
  if (convo.last_message_id) {
    const dbMessage = await db.getMessageById(convo.last_message_id);
    if (dbMessage) {
      lastMessage = {
        id: dbMessage.id,
        conversationId: dbMessage.conversation_id,
        senderId: dbMessage.sender_id,
        body: dbMessage.body,
        createdAt: dbMessage.created_at,
      };
    }
  }

  // Privacy-l1: never echo the encrypted ciphertext as a "preview". Use
  // a generic placeholder; the client decrypts on open.
  const lastMessagePreview: string | undefined = lastMessage ? 'Nouveau message' : undefined;

  let otherParticipant: ConversationMember | undefined;
  if (type === 'direct') {
    otherParticipant = members.find((m) => m.id !== currentUserId);
    if (!otherParticipant) return null;
  }

  return {
    id: convo.id,
    type,
    createdAt: convo.created_at,
    lastMessageAt: convo.last_message_at || undefined,
    lastMessagePreview,
    members,
    memberCount: members.length,
    createdBy: convo.created_by ?? null,
    encryptedTitle: convo.encrypted_title ?? null,
    otherParticipant,
  };
}
