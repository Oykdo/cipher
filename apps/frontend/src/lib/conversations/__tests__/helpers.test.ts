/**
 * Tests for conversation helpers (direct + group discrimination,
 * peer/title resolution).
 */

import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { ConversationSummaryV3 } from '../../../services/api-v2';
import {
  isGroupConversation,
  isDirectConversation,
  isConversationOwner,
  getDirectPeer,
  getConversationTitle,
  getMemberCount,
} from '../helpers';

// Lightweight i18n stub: `t(key, opts)` falls back to defaultValue when
// provided, else echoes the key. Sufficient for these unit tests.
const tStub: TFunction = ((
  key: string,
  opts?: Record<string, unknown>,
) => {
  if (opts && typeof opts.defaultValue === 'string') {
    let s = opts.defaultValue as string;
    for (const [k, v] of Object.entries(opts)) {
      if (k === 'defaultValue') continue;
      s = s.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    }
    return s;
  }
  return key;
}) as unknown as TFunction;

const ME = 'me-id';

function direct(otherId = 'peer-id', otherUsername = 'peer'): ConversationSummaryV3 {
  return {
    id: 'conv-direct',
    type: 'direct',
    createdAt: 1,
    members: [
      { id: ME, username: 'me' },
      { id: otherId, username: otherUsername },
    ],
    memberCount: 2,
    createdBy: null,
    encryptedTitle: null,
    otherParticipant: { id: otherId, username: otherUsername },
  };
}

function group(
  others: Array<{ id: string; username: string }>,
  opts: { ownerId?: string; encryptedTitle?: string | null } = {},
): ConversationSummaryV3 {
  const members = [{ id: ME, username: 'me' }, ...others];
  return {
    id: 'conv-group',
    type: 'group',
    createdAt: 1,
    members,
    memberCount: members.length,
    createdBy: opts.ownerId ?? ME,
    encryptedTitle: opts.encryptedTitle ?? null,
  };
}

describe('isGroupConversation / isDirectConversation', () => {
  it('discriminates direct vs group correctly', () => {
    expect(isDirectConversation(direct())).toBe(true);
    expect(isGroupConversation(direct())).toBe(false);
    expect(isGroupConversation(group([{ id: 'a', username: 'a' }]))).toBe(true);
    expect(isDirectConversation(group([{ id: 'a', username: 'a' }]))).toBe(false);
  });
});

describe('isConversationOwner', () => {
  it('is false for direct conversations regardless of userId', () => {
    expect(isConversationOwner(direct(), ME)).toBe(false);
  });

  it('matches the createdBy field for groups', () => {
    const g = group([{ id: 'bob', username: 'bob' }], { ownerId: ME });
    expect(isConversationOwner(g, ME)).toBe(true);
    expect(isConversationOwner(g, 'bob')).toBe(false);
  });
});

describe('getDirectPeer', () => {
  it('returns the non-self member of a direct conversation', () => {
    const peer = getDirectPeer(direct('bob-id', 'bob'), ME);
    expect(peer).toEqual({ id: 'bob-id', username: 'bob' });
  });

  it('returns null for groups', () => {
    expect(getDirectPeer(group([{ id: 'a', username: 'a' }]), ME)).toBeNull();
  });

  it('falls back to otherParticipant if members has only self', () => {
    const conv: ConversationSummaryV3 = {
      ...direct('bob-id', 'bob'),
      members: [{ id: ME, username: 'me' }],
    };
    expect(getDirectPeer(conv, ME)).toEqual({ id: 'bob-id', username: 'bob' });
  });
});

describe('getConversationTitle', () => {
  it("returns the peer's username for direct", () => {
    expect(getConversationTitle(direct('bob-id', 'bob'), ME, null, tStub)).toBe('bob');
  });

  it('returns the decrypted title for groups when present', () => {
    const g = group([{ id: 'bob', username: 'bob' }]);
    expect(getConversationTitle(g, ME, 'Secret Project', tStub)).toBe('Secret Project');
  });

  it('falls back to comma-separated usernames for groups without title', () => {
    const g = group([
      { id: 'bob', username: 'bob' },
      { id: 'carol', username: 'carol' },
    ]);
    expect(getConversationTitle(g, ME, null, tStub)).toBe('bob, carol');
  });

  it('appends "and N more" beyond 3 visible usernames', () => {
    const g = group([
      { id: 'a', username: 'alice' },
      { id: 'b', username: 'bob' },
      { id: 'c', username: 'carol' },
      { id: 'd', username: 'dan' },
      { id: 'e', username: 'eve' },
    ]);
    const title = getConversationTitle(g, ME, null, tStub);
    expect(title).toContain('alice, bob, carol');
    expect(title).toContain('2 more');
  });

  it('returns Untitled-group fallback when no other members exist', () => {
    const g = group([], { ownerId: ME });
    // synthesize an invalid 1-member group for the fallback path
    const title = getConversationTitle(g, ME, null, tStub);
    expect(title).toBe('Untitled group');
  });
});

describe('getMemberCount', () => {
  it('returns memberCount when present', () => {
    expect(getMemberCount(direct())).toBe(2);
  });

  it('falls back to members.length when memberCount is missing', () => {
    const conv = { ...direct(), memberCount: undefined as any };
    expect(getMemberCount(conv)).toBe(2);
  });
});
