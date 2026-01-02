
import { describe, it, expect } from 'vitest';
import { ResonanceCore } from '../ResonanceCore';
import { createEvent } from '../ResonanceLedger';

describe("Security Audit: Resonance Protocol Reforged", () => {

    describe("A. State Tampering (Client-Side Forgery)", () => {
        it("should detect discrepancy between mocked localStorage and event history", async () => {
            // Setup: Create a core with legit history but tampered state
            const genesis = await createEvent('genesis', {}, 'genesis', Date.now());
            const tamperedState = {
                cachedRho: 0.99, // User editing local storage to be max resonance
                history: [genesis], // History says 0.1 (baseline)
                aether: { available: 1_000_000, vested: 0, staked: 0, vesting: [] } // Fake money
            };

            const core = new ResonanceCore(tamperedState as any);

            // FIX VERIFIED:
            // Core detects forged state vs ledger and reverts to ledger truth.
            expect(core.rho).toBe(0.1);
            expect(core.snapshot(Date.now()).aether.available).toBe(0);
        });
    });

    describe("B. Sybil Attack Simulation (Bot Farm)", () => {
        // ... (This one is not fixed in Core yet, requires network layer, so we leave it or verify it still fails)
        it("should accept high weight lovebombs without proof of sender rho", async () => {
            const victimCore = new ResonanceCore();
            const attackerId = "sybil_bot_1";
            const fakeSignature = "sig_fake";

            await victimCore.processIncomingLovebomb(800, attackerId, fakeSignature);

            const vest = victimCore.snapshot(Date.now()).aether.vesting;
            expect(vest[0].amount).toBe(800);
        });
    });

    describe("C. Infinite Minting (Race Condition)", () => {
        it("should block double-minting via parallel requests", async () => {
            const core = new ResonanceCore();

            // Simulate parallel requests
            const now = Date.now();

            // We expect one to succeed and one to fail with Race Condition error
            const results = await Promise.allSettled([
                core.commitOutgoingMessage({ now, text: "Entropy High Message 1" }),
                core.commitOutgoingMessage({ now, text: "Entropy High Message 2" })
            ]);

            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');

            expect(fulfilled.length).toBe(1);
            expect(rejected.length).toBe(1);
            // @ts-ignore
            expect(rejected[0].reason.message).toContain("Race Condition");
        });
    });

    describe("D. Gas Bypass", () => {
        it("should allow operations without burn proof", async () => {
            const core = new ResonanceCore();

            // Normal flow: burn then send.
            // Exploit: just send.

            const res = await core.commitOutgoingMessage({ now: Date.now(), text: "Free Message" });
            expect(res.mintedAether).toBeDefined();

            // No error thrown regarding missing 'burn' transaction in the same block/timeframe.
        });
    });
});
