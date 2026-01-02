export interface SocialValidation {
    messageId: string;       // ID du message validé
    fromUserId: string;      // Celui qui donne le Lovebomb
    toUserId: string;        // Le créateur du message
    weight: number;          // Force du Lovebomb (basée sur rho du validateur)
    timestamp: number;
}

export const SOCIAL_CONSTANTS = {
    RHO_MULTIPLIER: 10,
    MIN_RHO_THRESHOLD: 0.3, // Bot protection (< 0.3)
    BURN_PERCENTAGE: 0.2,   // 20% burned (Cost of participation)
    TRANSFER_PERCENTAGE: 0.8, // 80% transferred to creator
};

/**
 * Calculates the "Weight" (Aether cost/value) of a Lovebomb based on validator's Rho.
 * Formula: Weight = Rho * 10
 */
export function calculateVoteWeight(validatorRho: number): number {
    if (validatorRho < SOCIAL_CONSTANTS.MIN_RHO_THRESHOLD) {
        return 0; // Bot/Low-reputation protection
    }
    return validatorRho * SOCIAL_CONSTANTS.RHO_MULTIPLIER;
}

/**
 * Calculates the split of the weight.
 * @returns { burned: number, transferred: number }
 */
export function calculateSocialSplit(weight: number): { burned: number, transferred: number } {
    return {
        burned: weight * SOCIAL_CONSTANTS.BURN_PERCENTAGE,
        transferred: weight * SOCIAL_CONSTANTS.TRANSFER_PERCENTAGE
    };
}

/**
 * Signs a lovebomb payload.
 * IN REALITY: This would use ECDSA/Ed25519 with the user's private key.
 * PROTOTYPE: Returns a mock signature hash.
 */
export async function signLovebomb(payload: SocialValidation): Promise<string> {
    const data = `${payload.messageId}:${payload.fromUserId}:${payload.toUserId}:${payload.weight}:${payload.timestamp}`;
    // Mock signature
    return `sig_${btoa(data).substring(0, 20)}`;
}

/**
 * Verifies a lovebomb signature.
 */
export async function verifyLovebombSignature(payload: SocialValidation, signature: string): Promise<boolean> {
    // Reconstruct expectations
    const data = `${payload.messageId}:${payload.fromUserId}:${payload.toUserId}:${payload.weight}:${payload.timestamp}`;
    const expected = `sig_${btoa(data).substring(0, 20)}`;
    return signature === expected;
}
