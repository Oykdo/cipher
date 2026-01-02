import { useCallback, useEffect } from 'react';
import { useResonance } from './useResonance';
import { calculateVoteWeight, SOCIAL_CONSTANTS, signLovebomb, verifyLovebombSignature } from '../services/SocialEcho';
import { useSocketWithRefresh } from './useSocketWithRefresh'; // For emitting real-time events

export function useSocialInteractions(userId?: string) {
    const resonance = useResonance(userId);
    const { socket } = useSocketWithRefresh();

    // Listener for INCOMING Lovebombs (Peer Validation)
    useEffect(() => {
        if (!socket || !userId) return;

        const handleIncomingLovebomb = async (payload: any) => {
            // Only care if it's for me
            if (payload.toUserId !== userId) return;

            // 1. Verify Signature (Chain of Custody)
            // Reconstruct the signed payload shape
            const validationPayload = {
                messageId: payload.messageId,
                fromUserId: payload.fromUserId,
                toUserId: payload.toUserId,
                weight: payload.weight,
                timestamp: payload.timestamp
            };

            const isValid = await verifyLovebombSignature(validationPayload, payload.signature);

            if (!isValid) {
                console.warn(`[Integrity] Invalid signature from ${payload.fromUserId}. Ignoring lovebomb.`);
                return;
            }

            console.log(`[Resonance] Received validated lovebomb from ${payload.fromUserId} (+${payload.transferredAmount} Aether)`);

            // 2. Process Reward (Vest & Record)
            // Note: Amount is now calculated locally in ResonanceCore based on Sender's Rho
            await resonance.processIncomingLovebomb(
                payload.messageId,
                payload.fromUserId,
                payload.signature
            );
        };

        socket.on('social_lovebomb', handleIncomingLovebomb);

        return () => {
            socket.off('social_lovebomb', handleIncomingLovebomb);
        };
    }, [socket, userId, resonance]);

    const amplifyMessage = useCallback(async (
        messageId: string,
        creatorId: string,
        conversationId: string
    ) => {
        if (!userId || !socket) return false;

        // 1. Calculate weight based on current Rho
        const weight = calculateVoteWeight(resonance.snapshot.rho);

        // Check if user has enough reputation to vote
        if (weight <= 0) {
            console.warn('Reputation too low to amplify.');
            return false;
        }

        // 2. Process locally (Burn + Deduct)
        // This returns the split if successful, null if insufficient funds
        const split = await resonance.processOutgoingLovebomb(weight);

        if (!split) {
            console.warn('Insufficient Aether to amplify.');
            return false; // UI should show error
        }

        // 3. Emit event to server (Peer-to-Peer validation)
        // The server will then notify the creator to "processIncomingLovebomb"
        try {
            const timestamp = Date.now();

            // Sign the payload
            const validationPayload = {
                messageId,
                fromUserId: userId,
                toUserId: creatorId,
                weight,
                timestamp
            };

            const signature = await signLovebomb(validationPayload);

            // We send the 'transferred' amount to the creator.
            // The 'burned' amount is already gone from our local state.
            socket.emit('social_lovebomb', {
                ...validationPayload,
                conversationId,
                transferredAmount: split.transferred,
                signature
            });

            return true;
        } catch (error) {
            console.error('Failed to emit lovebomb:', error);
            // Revert? For prototype, we accept the burn risk.
            return false;
        }
    }, [userId, resonance, socket]);

    return {
        amplifyMessage,
        // Whether user meets the minimum rho threshold to amplify
        canAmplify: (resonance.snapshot.rho >= SOCIAL_CONSTANTS.MIN_RHO_THRESHOLD),
        // Current user's rho for UI display
        currentRho: resonance.snapshot.rho,
        // Minimum rho required to amplify
        minRhoRequired: SOCIAL_CONSTANTS.MIN_RHO_THRESHOLD,
        // Estimated weight of the lovebomb
        estimatedWeight: calculateVoteWeight(resonance.snapshot.rho),
        // Available Aether for the operation
        availableAether: resonance.snapshot.aether?.available ?? 0,
    };
}
