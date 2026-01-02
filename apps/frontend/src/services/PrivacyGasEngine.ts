export interface MessagePayload {
    type: 'standard' | 'attachment' | 'timelock' | 'burn_after_reading';
    contentSize?: number; // Size in bytes
    lockDuration?: number; // Duration in seconds (for Time-Lock encapsulation)
}

export const GAS_CONSTANTS = {
    STANDARD_BASE_COST: 0,
    ATTACHMENT_BASE_COST: 1,
    TIMELOCK_BASE_COST: 2,
    BURN_BASE_COST_MULTIPLIER: 10,
    PRICE_PER_KB: 0.01,
    TIME_MULTIPLIER_PER_HOUR: 0.1,
};

/**
 * Calculates the Aether cost for a message.
 * 
 * Formula:
 * FinalCost = BaseCost * (1 - (rho * 0.8))
 * 
 * - Standard: Free
 * - Attachment: Base + Size * Price/KB
 * - Time-Lock: Slower = More Expensive (Storage cost)
 * - Burn-After-Reading: Premium Service (x10 base)
 */
export function calculateMessageGas(payload: MessagePayload, userRho: number = 0): number {
    let baseCost = 0;

    switch (payload.type) {
        case 'standard':
            return 0; // Always free to encourage adoption

        case 'attachment':
            const sizeKB = (payload.contentSize || 0) / 1024;
            baseCost = GAS_CONSTANTS.ATTACHMENT_BASE_COST + (sizeKB * GAS_CONSTANTS.PRICE_PER_KB);
            break;

        case 'timelock':
            const durationHours = (payload.lockDuration || 0) / 3600;
            baseCost = GAS_CONSTANTS.TIMELOCK_BASE_COST + (durationHours * GAS_CONSTANTS.TIME_MULTIPLIER_PER_HOUR);
            break;

        case 'burn_after_reading':
            // Premium privacy feature
            baseCost = GAS_CONSTANTS.ATTACHMENT_BASE_COST * GAS_CONSTANTS.BURN_BASE_COST_MULTIPLIER;
            // Add size cost if applicable (e.g. burn attachment)
            if (payload.contentSize) {
                const sizeKB = payload.contentSize / 1024;
                baseCost += (sizeKB * GAS_CONSTANTS.PRICE_PER_KB);
            }
            break;
    }

    // Apply Resonance Discount (VIP Status)
    // Max discount = 80% at Rho = 1.0
    const discountFactor = Math.min(0.8, Math.max(0, userRho * 0.8));
    const finalCost = baseCost * (1 - discountFactor);

    // Round to 2 decimals for cleaner UX, but keep enough precision
    return Math.round(finalCost * 100) / 100;
}
