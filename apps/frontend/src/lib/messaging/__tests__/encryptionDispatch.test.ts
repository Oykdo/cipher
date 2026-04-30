/**
 * Tests for the outgoing encryption dispatcher (encryptionDispatch.ts).
 *
 * Critical security checkpoint: groups MUST NOT fall back to e2ee-v1 or
 * the legacy masterKey envelope. These tests pin every failure mode for
 * groups to a typed error and assert that direct conversations still
 * have their v2 → v1 fallback path intact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversationSummaryV3 } from '../../../services/api-v2';
import {
  encryptOutgoing,
  GroupEncryptionError,
  DirectEncryptionError,
} from '../encryptionDispatch';

// ---------------------------------------------------------------------------
// Mocks — replace the heavy crypto + network dependencies with stubs we
// can drive deterministically. Each test sets up its mock to simulate one
// of the failure modes documented in the dispatcher.
// ---------------------------------------------------------------------------

vi.mock('../../e2ee/keyManager', () => ({
  loadUserKeys: vi.fn(),
}));
vi.mock('../../e2ee/publicKeyService', () => ({
  getConversationParticipantKeys: vi.fn(),
}));
vi.mock('../../e2ee/selfEncryptingMessage', () => ({
  encryptSelfEncryptingMessage: vi.fn(),
}));
vi.mock('../../e2ee/messagingIntegration', () => ({
  encryptMessageForSending: vi.fn(),
}));

import { loadUserKeys } from '../../e2ee/keyManager';
import { getConversationParticipantKeys } from '../../e2ee/publicKeyService';
import { encryptSelfEncryptingMessage } from '../../e2ee/selfEncryptingMessage';
import { encryptMessageForSending } from '../../e2ee/messagingIntegration';

const ME = 'me-id';
const PEER = 'peer-id';

function direct(): ConversationSummaryV3 {
  return {
    id: 'conv-direct',
    type: 'direct',
    createdAt: 1,
    members: [
      { id: ME, username: 'me' },
      { id: PEER, username: 'peer' },
    ],
    memberCount: 2,
    createdBy: null,
    encryptedTitle: null,
    otherParticipant: { id: PEER, username: 'peer' },
  };
}

function group(memberCount = 3): ConversationSummaryV3 {
  const members = [
    { id: ME, username: 'me' },
    ...Array.from({ length: memberCount - 1 }, (_, i) => ({
      id: `m${i}`,
      username: `m${i}`,
    })),
  ];
  return {
    id: 'conv-group',
    type: 'group',
    createdAt: 1,
    members,
    memberCount: members.length,
    createdBy: ME,
    encryptedTitle: null,
  };
}

const MOCK_USER_KEYS = {
  userId: ME,
  publicKey: new Uint8Array([1, 2, 3]),
  privateKey: new Uint8Array([4, 5, 6]),
  signPublicKey: new Uint8Array([7, 8, 9]),
  signPrivateKey: new Uint8Array([10, 11, 12]),
  createdAt: 1,
  version: 'key-v1' as const,
};

const baseCtx = {
  conversationId: 'conv-id',
  currentUserId: ME,
  useE2EEv2: true,
  legacyEncrypt: vi.fn().mockResolvedValue({ version: 'legacy', body: 'masterKey-encrypted' }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GROUPS — security-critical paths
// ===========================================================================

describe('encryptOutgoing — groups (e2ee-v2 only)', () => {
  it('encrypts via e2ee-v2 when all keys are available', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockResolvedValue([
      { userId: ME, publicKey: new Uint8Array(32) },
      { userId: 'm0', publicKey: new Uint8Array(32) },
      { userId: 'm1', publicKey: new Uint8Array(32) },
    ]);
    (encryptSelfEncryptingMessage as any).mockResolvedValue({
      version: 'e2ee-v2',
      keys: { [ME]: 'k', m0: 'k', m1: 'k' },
    });

    const out = await encryptOutgoing(group(3), 'hello', 'standard', baseCtx);
    expect(out).toContain('e2ee-v2');
    expect(encryptMessageForSending).not.toHaveBeenCalled();
  });

  it('throws GROUP_E2EE_MISSING_USER_KEYS when local keys are missing', async () => {
    (loadUserKeys as any).mockResolvedValue(null);

    await expect(
      encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
    ).rejects.toBeInstanceOf(GroupEncryptionError);
    await expect(
      encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
    ).rejects.toMatchObject({ code: 'GROUP_E2EE_MISSING_USER_KEYS' });
  });

  it('throws GROUP_E2EE_INCOMPLETE_KEYS when one member is missing keys', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockResolvedValue([
      { userId: ME, publicKey: new Uint8Array(32) },
      { userId: 'm0', publicKey: new Uint8Array(32) },
      // m1 missing → only 2 keys for memberCount=3
    ]);

    await expect(
      encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
    ).rejects.toMatchObject({ code: 'GROUP_E2EE_INCOMPLETE_KEYS' });
    expect(encryptSelfEncryptingMessage).not.toHaveBeenCalled();
    expect(encryptMessageForSending).not.toHaveBeenCalled();
  });

  it('throws GROUP_E2EE_PARTICIPANT_FETCH_FAILED on keys-fetch error', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockRejectedValue(
      new Error('Missing e2ee-v2 public keys for: m1'),
    );

    await expect(
      encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
    ).rejects.toMatchObject({ code: 'GROUP_E2EE_PARTICIPANT_FETCH_FAILED' });
    expect(encryptMessageForSending).not.toHaveBeenCalled();
  });

  it('throws GROUP_E2EE_ENCRYPTION_FAILED when libsodium itself errors', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockResolvedValue([
      { userId: ME, publicKey: new Uint8Array(32) },
      { userId: 'm0', publicKey: new Uint8Array(32) },
      { userId: 'm1', publicKey: new Uint8Array(32) },
    ]);
    (encryptSelfEncryptingMessage as any).mockRejectedValue(new Error('crypto kaboom'));

    await expect(
      encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
    ).rejects.toMatchObject({ code: 'GROUP_E2EE_ENCRYPTION_FAILED' });
    expect(encryptMessageForSending).not.toHaveBeenCalled();
  });

  it('NEVER falls back to e2ee-v1 for groups (the security invariant)', async () => {
    // Set up every plausible failure mode and confirm e2ee-v1 is never reached.
    const failureModes = [
      () => (loadUserKeys as any).mockResolvedValue(null),
      () => {
        (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
        (getConversationParticipantKeys as any).mockResolvedValue([]); // 0 < memberCount
      },
      () => {
        (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
        (getConversationParticipantKeys as any).mockRejectedValue(new Error('boom'));
      },
      () => {
        (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
        (getConversationParticipantKeys as any).mockResolvedValue([
          { userId: ME, publicKey: new Uint8Array(32) },
          { userId: 'm0', publicKey: new Uint8Array(32) },
          { userId: 'm1', publicKey: new Uint8Array(32) },
        ]);
        (encryptSelfEncryptingMessage as any).mockRejectedValue(new Error('boom'));
      },
    ];

    for (const setup of failureModes) {
      vi.clearAllMocks();
      setup();
      await expect(
        encryptOutgoing(group(3), 'hello', 'standard', baseCtx),
      ).rejects.toBeInstanceOf(GroupEncryptionError);
      expect(encryptMessageForSending).not.toHaveBeenCalled();
      expect(baseCtx.legacyEncrypt).not.toHaveBeenCalled();
    }
  });
});

// ===========================================================================
// DIRECT — v2 then v1 fallback (no legacy non-E2EE branch)
// ===========================================================================

describe('encryptOutgoing — direct (v2 → v1 fallback allowed)', () => {
  it('encrypts via e2ee-v2 when keys are available', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockResolvedValue([
      { userId: ME, publicKey: new Uint8Array(32) },
      { userId: PEER, publicKey: new Uint8Array(32) },
    ]);
    (encryptSelfEncryptingMessage as any).mockResolvedValue({
      version: 'e2ee-v2',
      keys: { [ME]: 'k', [PEER]: 'k' },
    });

    const out = await encryptOutgoing(direct(), 'hello', 'standard', baseCtx);
    expect(out).toContain('e2ee-v2');
    expect(encryptMessageForSending).not.toHaveBeenCalled();
  });

  it('falls back to e2ee-v1 when e2ee-v2 keys are missing for the peer', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockRejectedValue(
      new Error('Missing e2ee-v2 public keys for: peer'),
    );
    (encryptMessageForSending as any).mockResolvedValue('e2ee-v1-blob');

    const out = await encryptOutgoing(direct(), 'hello', 'standard', baseCtx);
    expect(out).toBe('e2ee-v1-blob');
    expect(encryptMessageForSending).toHaveBeenCalledWith('peer', 'hello', baseCtx.legacyEncrypt);
  });

  it('falls back to e2ee-v1 when fewer than 2 participant keys are returned', async () => {
    (loadUserKeys as any).mockResolvedValue(MOCK_USER_KEYS);
    (getConversationParticipantKeys as any).mockResolvedValue([
      { userId: ME, publicKey: new Uint8Array(32) },
    ]);
    (encryptMessageForSending as any).mockResolvedValue('e2ee-v1-blob');

    const out = await encryptOutgoing(direct(), 'hello', 'standard', baseCtx);
    expect(out).toBe('e2ee-v1-blob');
  });

  it('uses e2ee-v1 directly when useE2EEv2 is false', async () => {
    (encryptMessageForSending as any).mockResolvedValue('e2ee-v1-blob');

    const out = await encryptOutgoing(direct(), 'hello', 'standard', {
      ...baseCtx,
      useE2EEv2: false,
    });
    expect(out).toBe('e2ee-v1-blob');
    expect(encryptSelfEncryptingMessage).not.toHaveBeenCalled();
    expect(loadUserKeys).not.toHaveBeenCalled();
  });

  it('throws DIRECT_E2EE_NO_PEER if the conversation has no resolvable peer (bridge bug)', async () => {
    const orphan: ConversationSummaryV3 = {
      ...direct(),
      members: [{ id: ME, username: 'me' }],
      otherParticipant: undefined,
    };
    await expect(
      encryptOutgoing(orphan, 'hello', 'standard', baseCtx),
    ).rejects.toBeInstanceOf(DirectEncryptionError);
  });
});
