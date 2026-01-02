
import { ResonanceCore } from './ResonanceCore';
import { verifyChainIntegrity, createEvent } from './ResonanceLedger';
import { signLovebomb } from '../../services/SocialEcho';

async function runVerification() {
    console.log('--- Starting Resonance Integrity Verification ---');

    // 1. Initialize Core
    const core = new ResonanceCore();
    console.log('1. Core Initialized. Rho:', core.rho);

    if (core.rho !== 0.1) throw new Error('Initial Rho should be 0.1');

    // 2. Commit Message (Mining)
    console.log('\n--- Test: Commit Message ---');
    await core.commitOutgoingMessage({
        now: Date.now(),
        text: "Hello World! This is a high entropy message to mine Aether.",
    });

    console.log('Rho after message:', core.rho);
    console.log('History length:', core.toJSON().history.length);

    if (core.toJSON().history.length === 0) throw new Error('History should not be empty');

    // 3. Receive Lovebomb (Chain of Custody)
    console.log('\n--- Test: Receive Lovebomb (Signatures) ---');
    const senderId = "peer_user_123";
    const myId = "me";
    const weight = 5; // 5 Aether

    // Sign it
    const signature = await signLovebomb({
        messageId: "msg_1",
        fromUserId: senderId,
        toUserId: myId,
        weight,
        timestamp: Date.now()
    });

    await core.processIncomingLovebomb(weight * 0.8, senderId, signature); // 80% transferred
    console.log('Vesting queue:', core.toJSON().aether.vesting);

    const events = core.toJSON().history;
    const lbEvent = events.find(e => e.type === 'lovebomb_received');
    if (!lbEvent) throw new Error('Lovebomb event not found');
    if (lbEvent.signature !== signature) throw new Error('Signature mismatch in ledger');
    console.log('Lovebomb verified and recorded.');

    // 4. Staking (ZK Proof of State)
    console.log('\n--- Test: Staking (ZK Proof) ---');
    // Need Aether to stake. Let's cheat/inject Aether for test or rely on previous gain.
    // We can just set state directly for test (using constructor) or assuming we mined enough.
    // Let's check available.
    let available = core.snapshot(Date.now()).aether.available;
    console.log('Available Aether:', available);

    // If not enough, let's just force it slightly for the test by mining more or mocking.
    // Actually, let's use a new core with pre-filled state for staking test.
    const richCore = new ResonanceCore({
        aether: { available: 100, vested: 0, staked: 0, vesting: [] }
    });

    await richCore.stake(10);
    const richHistory = richCore.toJSON().history;
    const stakeEvent = richHistory.find(e => e.type === 'stake');

    if (!stakeEvent) throw new Error('Stake event not found');
    if (!stakeEvent.payload.proof) throw new Error('Stake event missing ZK Proof');
    console.log('Stake event recorded with Proof:', stakeEvent.payload.proof);

    // 5. Verify Chain Integrity
    console.log('\n--- Test: Chain Integrity ---');
    const valid = await verifyChainIntegrity(richHistory);
    console.log('Chain Valid:', valid);
    if (!valid) throw new Error('Chain integrity check failed');

    // Tamper Test
    console.log('\n--- Test: Tamper Resistance ---');
    richHistory[0].payload = { tampered: true }; // Modify Genesis or first event
    const tamperedValid = await verifyChainIntegrity(richHistory);
    console.log('Tampered Chain Valid:', tamperedValid);
    if (tamperedValid) throw new Error('Tamper check failed (Should return false)');

    console.log('\n✅ VERIFICATION SUCCESSFUL');
}

runVerification().catch(console.error);
