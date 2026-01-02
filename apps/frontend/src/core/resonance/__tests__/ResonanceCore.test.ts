import { describe, expect, it } from 'vitest';

import { ResonanceCore } from '../ResonanceCore';

describe('ResonanceCore', () => {
  it('starts at baseline rho=0.1', () => {
    const core = new ResonanceCore();
    const snap = core.snapshot(Date.now());
    expect(snap.rho).toBeCloseTo(0.1, 6);
  });

  it('locks on cognitive mismatch (robotic keystrokes)', async () => {
    const core = new ResonanceCore();

    const t0 = 1_000_000;
    // 9 keystrokes => 8 intervals, each exactly 100ms (variance=0)
    for (let i = 0; i < 9; i++) {
      core.recordKeystroke(t0 + i * 100);
    }

    const res = await core.validateSendAttempt({ now: t0 + 1_000, text: 'hello', peerId: 'peer-1' });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('COGNITIVE_MISMATCH');

    const snap = core.snapshot(t0 + 1_000);
    expect(snap.rho).toBe(0);
    expect(typeof snap.lockedUntil).toBe('number');
    expect((snap.lockedUntil as number)!).toBeGreaterThan(t0 + 1_000);
  });

  it('does not mint when peer resonance is not higher (sybil gating)', () => {
    const core = new ResonanceCore();

    const now = 2_000_000;
    const msg =
      'Complex message: entropy ++ with symbols #$% and numbers 1234567890 and mixedCaseWords to reach length.';

    const committed = core.commitOutgoingMessage({ now, text: msg, peerId: 'peer-1' });

    // New peer starts at 0.1; user rho will rise above baseline => peerRho is NOT > user rho.
    expect(committed.mintedAether).toBe(0);
    expect(committed.vestingEntry).toBeUndefined();
  });

  it('mints and vests when peer resonance is higher and message is high-quality', () => {
    const core = new ResonanceCore({
      peerRho: { 'peer-1': 0.95 },
    });

    const now = 3_000_000;
    const msg =
      'High-entropy message with diverse characters: ABCdef123!@#$%^&*()_+[]{};:,.<>/? and extra words to exceed 80 chars.';

    const committed = core.commitOutgoingMessage({ now, text: msg, peerId: 'peer-1' });

    expect(committed.mintedAether).toBeGreaterThan(0);
    expect(committed.vestingEntry).toBeDefined();
    expect((committed.vestingEntry as any).unlockAt).toBeGreaterThan(now);

    // With max gain, we expect to hit the per-event cap.
    expect(committed.mintedAether).toBe(15);
  });

  it('settles vesting into available once unlocked', () => {
    const now = 10_000;
    const core = new ResonanceCore({
      aether: {
        available: 0,
        staked: 0,
        vesting: [{ amount: 5, unlockAt: now - 1 }],
      },
    });

    const snap = core.snapshot(now);
    expect(snap.aether.available).toBe(5);
    expect(snap.aether.vested).toBe(0);
  });

  it('applies damping toward baseline over the half-life', () => {
    const now = 50_000_000;
    const halfLifeMs = 6 * 60 * 60 * 1000;

    const core = new ResonanceCore({
      rho: 0.9,
      lastMessageAt: now - halfLifeMs,
    });

    core.tick(now);

    // baseline + (0.9-baseline) * 0.5
    const expected = 0.1 + (0.9 - 0.1) * 0.5;
    expect(core.snapshot(now).rho).toBeCloseTo(expected, 4);
  });
});
