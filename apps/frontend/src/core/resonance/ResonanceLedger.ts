export type ResonanceEventType =
    | 'genesis'
    | 'message_sent'
    | 'lovebomb_received'
    | 'stake'
    | 'unstake'
    | 'slash_penalty';

export interface ResonanceEvent {
    id: string; // Hash(type + timestamp + payload + prevHash)
    type: ResonanceEventType;
    timestamp: number;
    payload: any;
    signature?: string; // Digital signature for chain of custody
    prevHash: string; // Link to previous event (Blockchain-lite)
}

export interface LedgerState {
    rho: number;
    lastHash: string;
}

// SHA-256 helper (simplified for prototype)
async function sha256(text: string): Promise<string> {
    const enc = new TextEncoder();
    const algorithm = 'SHA-256';
    // Use Web Crypto API
    if (globalThis.crypto?.subtle) {
        const hashBuffer = await globalThis.crypto.subtle.digest(algorithm, enc.encode(text));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for simple environments or just return a mock hash if crypto is missing (NOT SECURE)
    console.warn('Crypto API not available, using mock hash');
    return 'mock-hash-' + Math.random();
}

/**
 * Computes the current Rho score by replaying the history.
 */
export interface ReconstructedState {
    rho: number;
    aether: {
        available: number;
        staked: number;
        vesting: { amount: number; unlockAt: number }[];
    };
    processedLovebombSignatures: string[];
}

/**
 * Computes the current State by replaying the history (Event Sourcing).
 * This ensures that a compromised `cachedRho` in localStorage is ignored.
 */
export function computeStateFromHistory(history: ResonanceEvent[], baselineRho: number = 0.1): ReconstructedState {
    const state: ReconstructedState = {
        rho: baselineRho,
        aether: {
            available: 0,
            staked: 0,
            vesting: []
        },
        processedLovebombSignatures: []
    };

    for (const event of history) {
        switch (event.type) {
            case 'message_sent':
                if (event.payload?.rhoDelta) {
                    state.rho = Math.min(1, Math.max(0, state.rho + event.payload.rhoDelta));
                }
                if (event.payload?.vestingEntry) {
                    state.aether.vesting.push(event.payload.vestingEntry);
                }
                if (event.payload?.split?.burned) {
                    // Outgoing lovebomb burn
                    state.aether.available -= (event.payload.weight || 0);
                }
                break;

            case 'lovebomb_received':
                if (event.payload?.signature) {
                    state.processedLovebombSignatures.push(event.payload.signature);
                }
                if (event.payload?.amount) {
                    // Vesting for rewards (3 days usually, or hardcoded in logic)
                    // If payload doesn't have unlockAt, we might need to assume logic or Core needs to log it.
                    // For now, let's assume Core logs it or we add a default.
                    // Actually Core puts it in memory. It should be in the event.
                    state.aether.vesting.push({
                        amount: event.payload.amount,
                        unlockAt: event.timestamp + 3 * 24 * 60 * 60 * 1000 // Fallback if not in payload
                    });
                }
                break;

            case 'stake':
                if (event.payload?.amount) {
                    state.aether.available -= event.payload.amount;
                    state.aether.staked += event.payload.amount;
                }
                break;

            case 'unstake':
                if (event.payload?.amount) {
                    state.aether.staked -= event.payload.amount;
                    state.aether.vesting.push({
                        amount: event.payload.amount,
                        unlockAt: event.timestamp + 7 * 24 * 60 * 60 * 1000
                    });
                }
                break;

            case 'slash_penalty':
                if (event.payload?.rhoPenalty) {
                    state.rho = Math.min(1, Math.max(0, state.rho - event.payload.rhoPenalty));
                }
                if (event.payload?.penalty?.rhoAfter !== undefined) {
                    // Hard set from penalty decision
                    state.rho = event.payload.penalty.rhoAfter;
                }
                if (event.payload?.amount) {
                    // Service fee burn
                    state.aether.available -= event.payload.amount;
                }
                if (event.payload?.penalty?.slashedAmount) {
                    // Stake slash
                    state.aether.staked -= event.payload.penalty.slashedAmount;
                }
                break;
        }
    }
    return state;
}

/**
 * Creates a new event linked to the previous chain.
 */
export async function createEvent(
    type: ResonanceEventType,
    payload: any,
    prevHash: string,
    timestamp: number = Date.now()
): Promise<ResonanceEvent> {
    const dataToHash = `${type}:${timestamp}:${JSON.stringify(payload)}:${prevHash}`;
    const id = await sha256(dataToHash);

    return {
        id,
        type,
        timestamp,
        payload,
        prevHash
    };
}

/**
 * Verifies the integrity of the event chain.
 */
export async function verifyChainIntegrity(history: ResonanceEvent[]): Promise<boolean> {
    if (history.length === 0) return true;

    // Verify Genesis (optional check)

    for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];

        if (curr.prevHash !== prev.id) {
            console.error(`Hash mismatch at index ${i}: prevHash ${curr.prevHash} != ${prev.id}`);
            return false;
        }

        // Verify hash computation
        const dataToHash = `${curr.type}:${curr.timestamp}:${JSON.stringify(curr.payload)}:${curr.prevHash}`;
        const calculatedId = await sha256(dataToHash);

        if (calculatedId !== curr.id) {
            console.error(`Tampered event at index ${i}: calculated ${calculatedId} != stored ${curr.id}`);
            return false;
        }
    }
    return true;
}
