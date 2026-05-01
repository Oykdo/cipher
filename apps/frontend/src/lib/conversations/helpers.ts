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

/**
 * Infer the effective type of a conversation. Server rows created before
 * the 1.2.0 group migration may have a NULL/undefined `type` column even
 * though they were created via the group flow. We treat such rows as
 * groups when *any* group-only signal is present (`createdBy`,
 * `encryptedTitle`, or memberCount > 2). Without this fallback the row
 * gets misclassified as 'direct' and rendered under the 1:1 section
 * while its title still resolves to "Untitled group".
 */
function effectiveType(conv: ConversationSummaryV3): 'direct' | 'group' {
  if (conv.type === 'group' || conv.type === 'direct') return conv.type;
  if (conv.createdBy || conv.encryptedTitle) return 'group';
  if ((conv.memberCount ?? conv.members?.length ?? 0) > 2) return 'group';
  return 'direct';
}

export function isGroupConversation(conv: ConversationSummaryV3): boolean {
  return effectiveType(conv) === 'group';
}

export function isDirectConversation(conv: ConversationSummaryV3): boolean {
  return effectiveType(conv) === 'direct';
}

export function isConversationOwner(
  conv: ConversationSummaryV3,
  userId: string,
): boolean {
  return effectiveType(conv) === 'group' && conv.createdBy === userId;
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
  if (effectiveType(conv) !== 'direct') return null;
  const fromMembers = (conv.members ?? []).find((m) => m.id !== currentUserId);
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
  if (effectiveType(conv) === 'direct') {
    const peer = getDirectPeer(conv, currentUserId);
    return peer?.username ?? t('conversations.unknown_user', { defaultValue: 'Unknown' });
  }

  if (decryptedGroupTitle && decryptedGroupTitle.trim().length > 0) {
    return decryptedGroupTitle;
  }

  // `members` is required by the v3 API contract but legacy cached summaries
  // (pre-1.2.0) and rare server edge cases can omit it. Default to [] so the
  // list keeps rendering with the i18n "Untitled group" fallback below.
  const others = (conv.members ?? []).filter((m) => m.id !== currentUserId);
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
  return conv.memberCount ?? conv.members?.length ?? 0;
}
