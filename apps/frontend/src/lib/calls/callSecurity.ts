// 10 minutes. Wide enough to tolerate slow accept-on-incoming, clock skew
// between peers, and high-RTT signaling on mobile/VPN networks; narrow
// enough to keep the replay-protection cache bounded.
export const CALL_SIGNATURE_MAX_AGE_MS = 600000;

export interface SignedEnvelopePayload {
  eventName: string;
  signedAt: number;
  payload: Record<string, unknown>;
}

export function serializeSignedPayload(
  eventName: string,
  payload: Record<string, unknown>,
  signedAt: number
): string {
  return JSON.stringify({
    eventName,
    signedAt,
    payload,
  } satisfies SignedEnvelopePayload);
}

export function isSignatureFresh(
  signedAt: number,
  now: number = Date.now(),
  maxAgeMs: number = CALL_SIGNATURE_MAX_AGE_MS
): boolean {
  return Math.abs(now - signedAt) <= maxAgeMs;
}

export class ReplayProtectionCache {
  private seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = CALL_SIGNATURE_MAX_AGE_MS) {}

  checkAndMark(key: string, now: number = Date.now()): boolean {
    this.prune(now);
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.set(key, now);
    return true;
  }

  prune(now: number = Date.now()): void {
    for (const [key, timestamp] of this.seen.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.seen.delete(key);
      }
    }
  }

  size(): number {
    return this.seen.size;
  }
}
