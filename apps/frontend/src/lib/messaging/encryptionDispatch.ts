/**
 * Outgoing message encryption dispatcher (Cipher 1.2.0).
 *
 * Single entry point for every message body the client sends to the
 * bridge. The function discriminates on `conv.type`:
 *
 *   - direct (1:1): try e2ee-v2 first (when keys are available on both
 *     sides), fall back to e2ee-v1 (X3DH + Double Ratchet, or NaCl Box
 *     as the legacy NaCl fallback). The tail "legacy non-E2EE" branch
 *     that previously sent masterKey-encrypted blobs to the server when
 *     no peerUsername was present has been REMOVED — every direct
 *     conversation has a peerUsername by construction (the bridge
 *     guarantees the membership rows), so reaching that path was a bug.
 *
 *   - group (2-10): e2ee-v2 ONLY. Hard error if the user's keys are
 *     missing, if any member's public key is missing, or if the keys
 *     map size doesn't match memberCount. NEVER falls back to e2ee-v1
 *     — v1 is intrinsically 1:1 (the X3DH session manager keys sessions
 *     by peerUsername) and applying it to a group would silently leave
 *     most members unable to decrypt while still surfacing as "encrypted"
 *     to the sender. See §4 of the 1.2.0 plan.
 *
 * The four error codes thrown for groups
 *   - GROUP_E2EE_MISSING_USER_KEYS
 *   - GROUP_E2EE_INCOMPLETE_KEYS
 *   - GROUP_E2EE_PARTICIPANT_FETCH_FAILED
 *   - GROUP_E2EE_ENCRYPTION_FAILED
 * are all distinct from the v1 fallback path so the UI can render an
 * actionable error instead of a generic "encryption failed".
 */

import type { ConversationSummaryV3 } from '../../services/api-v2';
import { isGroupConversation, getDirectPeer } from '../conversations/helpers';
import { encryptSelfEncryptingMessage } from '../e2ee/selfEncryptingMessage';
import { getConversationParticipantKeys } from '../e2ee/publicKeyService';
import { loadUserKeys } from '../e2ee/keyManager';
import { encryptMessageForSending } from '../e2ee/messagingIntegration';

export type OutgoingMessageType = 'standard' | 'bar' | 'timelock' | 'attachment';

export interface EncryptionDispatchContext {
  /** ID of the conversation we're sending to. */
  conversationId: string;
  /** Currently authenticated user. */
  currentUserId: string;
  /** Whether e2ee-v2 keys are present on this device. Direct uses it as a hint. */
  useE2EEv2: boolean;
  /**
   * Last-resort encrypter used by e2ee-v1 (`encryptMessageForSending`)
   * when X3DH/DR isn't yet established. Wraps the plaintext under the
   * legacy masterKey-derived NaCl Box. Direct-only.
   */
  legacyEncrypt?: (plaintext: string) => Promise<unknown>;
  /**
   * Optional metadata for attachment envelopes (filename, mime, size).
   * Only used when messageType === 'attachment'.
   */
  attachmentMetadata?: {
    filename?: string;
    mimeType?: string;
    size?: number;
  };
}

export class GroupEncryptionError extends Error {
  constructor(
    public readonly code:
      | 'GROUP_E2EE_MISSING_USER_KEYS'
      | 'GROUP_E2EE_INCOMPLETE_KEYS'
      | 'GROUP_E2EE_PARTICIPANT_FETCH_FAILED'
      | 'GROUP_E2EE_ENCRYPTION_FAILED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GroupEncryptionError';
  }
}

export class DirectEncryptionError extends Error {
  constructor(
    public readonly code: 'DIRECT_E2EE_NO_PEER',
    message: string,
  ) {
    super(message);
    this.name = 'DirectEncryptionError';
  }
}

/**
 * Encrypt the outgoing body for the given conversation. Returns a JSON
 * string ready to be sent in the message envelope. Throws a typed error
 * for groups (no v1 fallback) — the caller should surface a UI error
 * via i18n key `conversations.group.error_e2ee_missing_keys` (or a more
 * specific key when available).
 */
export async function encryptOutgoing(
  conv: ConversationSummaryV3,
  plaintext: string,
  messageType: OutgoingMessageType,
  ctx: EncryptionDispatchContext,
): Promise<string> {
  if (isGroupConversation(conv)) {
    return encryptForGroup(conv, plaintext, messageType, ctx);
  }
  return encryptForDirect(conv, plaintext, messageType, ctx);
}

// ============================================================================
// GROUP — e2ee-v2 ONLY, hard error on every failure mode
// ============================================================================

async function encryptForGroup(
  conv: ConversationSummaryV3,
  plaintext: string,
  messageType: OutgoingMessageType,
  ctx: EncryptionDispatchContext,
): Promise<string> {
  const userKeys = await loadUserKeys(ctx.currentUserId);
  if (!userKeys) {
    throw new GroupEncryptionError(
      'GROUP_E2EE_MISSING_USER_KEYS',
      'Your e2ee-v2 keys are missing on this device. Re-establish them before sending to a group.',
    );
  }

  let participantKeys;
  try {
    participantKeys = await getConversationParticipantKeys(ctx.conversationId);
  } catch (err) {
    throw new GroupEncryptionError(
      'GROUP_E2EE_PARTICIPANT_FETCH_FAILED',
      err instanceof Error ? err.message : String(err),
      err,
    );
  }

  if (participantKeys.length !== conv.memberCount) {
    throw new GroupEncryptionError(
      'GROUP_E2EE_INCOMPLETE_KEYS',
      `Got keys for ${participantKeys.length} of ${conv.memberCount} members. ` +
        'Every member must have published their e2ee-v2 keys before sending to the group.',
    );
  }

  try {
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      participantKeys.map((p) => ({ userId: p.userId, publicKey: p.publicKey })),
      messageType,
      ctx.attachmentMetadata,
    );
    return JSON.stringify(encrypted);
  } catch (err) {
    throw new GroupEncryptionError(
      'GROUP_E2EE_ENCRYPTION_FAILED',
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

// ============================================================================
// DIRECT — e2ee-v2 attempt then e2ee-v1 fallback (no legacy non-E2EE branch)
// ============================================================================

async function encryptForDirect(
  conv: ConversationSummaryV3,
  plaintext: string,
  messageType: OutgoingMessageType,
  ctx: EncryptionDispatchContext,
): Promise<string> {
  const peer = getDirectPeer(conv, ctx.currentUserId);
  if (!peer) {
    // Bridge invariant violation — every direct conversation has two
    // members. If we get here it's a bug, not a UX state, so throw.
    throw new DirectEncryptionError(
      'DIRECT_E2EE_NO_PEER',
      'Direct conversation has no resolvable peer (bridge inconsistency).',
    );
  }

  // Attempt e2ee-v2 when local keys exist. Any failure (missing peer
  // public keys, transient fetch error, encryption exception) falls
  // back to e2ee-v1 — that legacy path remains valid for direct.
  if (ctx.useE2EEv2) {
    try {
      const userKeys = await loadUserKeys(ctx.currentUserId);
      if (userKeys) {
        const participantKeys = await getConversationParticipantKeys(ctx.conversationId);
        if (participantKeys.length >= 2) {
          const encrypted = await encryptSelfEncryptingMessage(
            plaintext,
            participantKeys.map((p) => ({ userId: p.userId, publicKey: p.publicKey })),
            messageType,
            ctx.attachmentMetadata,
          );
          return JSON.stringify(encrypted);
        }
      }
    } catch {
      // intentionally fall through to v1
    }
  }

  // e2ee-v1 fallback — uses peerUsername for the per-pair X3DH/DR session,
  // which is well-defined for direct only.
  return encryptMessageForSending(peer.username, plaintext, ctx.legacyEncrypt);
}
