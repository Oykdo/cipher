/**
 * Conversation helpers — direct + group aware.
 *
 * Centralises the discrimination logic so the rest of the app reads
 * `isGroupConversation(conv)` rather than inspecting `conv.type` ad hoc.
 * Also handles the "what title do I render" decision tree once: peer
 * username for direct, decrypted group title if available, otherwise a
 * compact list of usernames as a fallback.
 */

import type { TFunction } from 'i18next';
import type { ConversationSummaryV3, ConversationMemberV3 } from '../../services/api-v2';

export function isGroupConversation(conv: ConversationSummaryV3): boolean {
  return conv.type === 'group';
}

export function isDirectConversation(conv: ConversationSummaryV3): boolean {
  return conv.type === 'direct';
}

export function isConversationOwner(
  conv: ConversationSummaryV3,
  userId: string,
): boolean {
  return conv.type === 'group' && conv.createdBy === userId;
}

/**
 * Resolve the "other side" of a direct conversation. Returns null for
 * groups (callers should check `isGroupConversation()` first if they
 * want to render member lists). Falls back to `otherParticipant` if the
 * server included it (older endpoints) but prefers `members`.
 */
export function getDirectPeer(
  conv: ConversationSummaryV3,
  currentUserId: string,
): ConversationMemberV3 | null {
  if (conv.type !== 'direct') return null;
  const fromMembers = conv.members.find((m) => m.id !== currentUserId);
  if (fromMembers) return fromMembers;
  return conv.otherParticipant ?? null;
}

/**
 * Best human-readable title for a conversation:
 *   - direct  → peer.username
 *   - group   → decrypted title if provided
 *   - group fallback → comma-separated list of up to 3 other usernames,
 *     with i18n "and N more" suffix when there are more.
 */
export function getConversationTitle(
  conv: ConversationSummaryV3,
  currentUserId: string,
  decryptedGroupTitle: string | null,
  t: TFunction,
): string {
  if (conv.type === 'direct') {
    const peer = getDirectPeer(conv, currentUserId);
    return peer?.username ?? t('conversations.unknown_user', { defaultValue: 'Unknown' });
  }

  if (decryptedGroupTitle && decryptedGroupTitle.trim().length > 0) {
    return decryptedGroupTitle;
  }

  const others = conv.members.filter((m) => m.id !== currentUserId);
  if (others.length === 0) {
    return t('conversations.group.untitled', { defaultValue: 'Untitled group' });
  }

  const visible = others.slice(0, 3).map((m) => m.username);
  const remaining = others.length - visible.length;
  if (remaining > 0) {
    return t('conversations.group.untitled_with_more', {
      users: visible.join(', '),
      more: remaining,
      defaultValue: `${visible.join(', ')} and ${remaining} more`,
    });
  }
  return visible.join(', ');
}

/** Return the count of members, useful for headers / chips. */
export function getMemberCount(conv: ConversationSummaryV3): number {
  return conv.memberCount ?? conv.members.length;
}
