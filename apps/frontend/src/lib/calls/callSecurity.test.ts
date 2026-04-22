import { describe, expect, it } from 'vitest';

import {
  CALL_SIGNATURE_MAX_AGE_MS,
  ReplayProtectionCache,
  isSignatureFresh,
  serializeSignedPayload,
} from './callSecurity';

describe('callSecurity', () => {
  it('serializes signed payloads deterministically', () => {
    const signedAt = 123456789;
    const payload = { conversationId: 'conv-1', mediaType: 'video' };

    expect(serializeSignedPayload('call:invite', payload, signedAt)).toBe(
      JSON.stringify({
        eventName: 'call:invite',
        signedAt,
        payload,
      })
    );
  });

  it('accepts fresh signatures inside the replay window', () => {
    const now = 500000;
    expect(isSignatureFresh(now - (CALL_SIGNATURE_MAX_AGE_MS - 1), now)).toBe(true);
    expect(isSignatureFresh(now + (CALL_SIGNATURE_MAX_AGE_MS - 1), now)).toBe(true);
  });

  it('rejects stale signatures outside the replay window', () => {
    const now = 500000;
    expect(isSignatureFresh(now - (CALL_SIGNATURE_MAX_AGE_MS + 1), now)).toBe(false);
    expect(isSignatureFresh(now + (CALL_SIGNATURE_MAX_AGE_MS + 1), now)).toBe(false);
  });

  it('rejects replayed event ids until they expire', () => {
    const cache = new ReplayProtectionCache(1000);

    expect(cache.checkAndMark('evt-1', 100)).toBe(true);
    expect(cache.checkAndMark('evt-1', 200)).toBe(false);
    expect(cache.size()).toBe(1);

    cache.prune(1201);
    expect(cache.checkAndMark('evt-1', 1201)).toBe(true);
  });
});
