import type { FastifyInstance } from 'fastify';
import * as blockchain from '../services/blockchain-bitcoin.js';

/**
 * Blockchain and time-lock routes
 * Bitcoin blockchain integration for message time-locking
 */
export async function blockchainRoutes(fastify: FastifyInstance) {
  // Get blockchain info
  fastify.get('/blockchain/info', async () => {
    return await blockchain.getBlockchainInfo();
  });

  // Blockchain health check
  fastify.get('/blockchain/health', async () => {
    const health = await blockchain.healthCheck();
    const stats = blockchain.getStats();

    return {
      ...health,
      stats,
      message:
        health.source === 'bitcoin'
          ? 'Connected to Bitcoin mainnet'
          : 'Using simulated blockchain (Bitcoin API unavailable)',
    };
  });

  // Get current blockchain height
  fastify.get('/blockchain/current-height', async () => {
    return {
      height: await blockchain.getCurrentBlockHeight(),
      timestamp: blockchain.getServerTimestamp(), // Source de vérité serveur
    };
  });

  // Secure time synchronization route
  // Client MUST use this timestamp as reference, not local time
  fastify.get('/blockchain/sync-time', async () => {
    const serverTime = blockchain.getServerTimestamp();
    const currentHeight = await blockchain.getCurrentBlockHeight();

    return {
      serverTimestamp: serverTime,
      currentHeight,
      blockTime: 600000, // Bitcoin: 10 minutes = 600000ms
      message: "Ce timestamp est la source de vérité. Ne pas utiliser l'heure locale du client.",
    };
  });

  // Calculate block target from timestamp
  fastify.post<{ Body: { targetTimestamp?: number } }>(
    '/blockchain/calculate-target',
    async (request, reply) => {
      const { targetTimestamp } = request.body;

      if (!targetTimestamp || typeof targetTimestamp !== 'number') {
        reply.code(400);
        return { error: 'targetTimestamp requis (number)' };
      }

      const targetHeight = await blockchain.calculateBlockTarget(targetTimestamp);

      if (targetHeight === null) {
        reply.code(400);
        return { error: 'Date doit être dans le futur' };
      }

      if (!(await blockchain.validateUnlockHeight(targetHeight))) {
        reply.code(400);
        return { error: 'Date trop loin dans le futur (max 1 an)' };
      }

      const currentHeight = await blockchain.getCurrentBlockHeight();
      const waitTime = await blockchain.timeUntilUnlock(targetHeight);

      return {
        targetTimestamp,
        unlockHeight: targetHeight,
        currentHeight,
        estimatedWaitTime: waitTime,
        estimatedWaitFormatted: blockchain.formatTimeRemaining(waitTime),
      };
    }
  );

  // Get common time-lock durations
  fastify.get('/blockchain/common-durations', async () => {
    const durations = await Promise.all(
      blockchain.COMMON_TIMELOCK_DURATIONS.map(async (duration) => ({
        ...duration,
        unlockHeight: await blockchain.calculateHeightFromDuration(duration.minutes),
      }))
    );
    return durations;
  });
}
