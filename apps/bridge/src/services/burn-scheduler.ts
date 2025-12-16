/**
 * Burn Scheduler Service
 * 
 * Gère la destruction automatique des messages "Burn After Reading"
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

interface ScheduledBurn {
  messageId: string;
  conversationId: string;
  scheduledBurnAt: number;
  timeoutId: NodeJS.Timeout;
}

class BurnScheduler {
  private scheduledBurns: Map<string, ScheduledBurn> = new Map();
  private fastify: FastifyInstance | null = null;

  /**
   * Initialize the scheduler with Fastify instance
   */
  initialize(fastify: FastifyInstance) {
    this.fastify = fastify;
    fastify.log.info('🔥 Burn Scheduler initialized');
  }

  /**
   * Schedule a message to be burned at a specific time
   */
  schedule(messageId: string, conversationId: string, scheduledBurnAt: number | Date) {
    if (!this.fastify) {
      throw new Error('BurnScheduler not initialized');
    }

    const scheduledAtMs = scheduledBurnAt instanceof Date ? scheduledBurnAt.getTime() : scheduledBurnAt;

    // Cancel existing schedule if any
    this.cancel(messageId);

    const now = Date.now();
    const delay = Math.max(0, scheduledAtMs - now);

    if (delay === 0) {
      // Burn immediately
      this.burnMessage(messageId, conversationId);
      return;
    }

    // Schedule burn
    const timeoutId = setTimeout(() => {
      this.burnMessage(messageId, conversationId);
    }, delay);

    this.scheduledBurns.set(messageId, {
      messageId,
      conversationId,
      scheduledBurnAt: scheduledAtMs,
      timeoutId,
    });

    this.fastify.log.info({
      messageId,
      conversationId,
      scheduledBurnAt: new Date(scheduledAtMs).toISOString(),
      delayMs: delay,
    }, '🔥 Message burn scheduled');
  }

  /**
   * Cancel a scheduled burn
   */
  cancel(messageId: string) {
    const scheduled = this.scheduledBurns.get(messageId);
    if (scheduled) {
      clearTimeout(scheduled.timeoutId);
      this.scheduledBurns.delete(messageId);
      
      if (this.fastify) {
        this.fastify.log.info({ messageId }, '🔥 Message burn cancelled');
      }
    }
  }

  /**
   * Burn a message immediately
   */
  private async burnMessage(messageId: string, conversationId: string) {
    if (!this.fastify) return;

    try {
      const burnedAt = Date.now();

      // Burn After Reading: permanently delete from database
      await db.burnMessage(messageId, burnedAt);

      // Remove from scheduled burns
      this.scheduledBurns.delete(messageId);

      // Notify clients via Socket.IO
      this.fastify.io.emitMessageBurned({
        conversationId,
        messageId,
        burnedAt,
      });

      this.fastify.log.info({
        messageId,
        conversationId,
        burnedAt: new Date(burnedAt).toISOString(),
      }, '🔥 Message burned successfully');
    } catch (error: any) {
      this.fastify.log.error({
        messageId,
        conversationId,
        error: error.message,
      }, '❌ Failed to burn message');
    }
  }

  /**
   * Load all pending burns from database on startup
   */
  async loadPendingBurns() {
    if (!this.fastify) {
      throw new Error('BurnScheduler not initialized');
    }

    try {
      const pendingBurns = await db.getPendingBurns();
      
      for (const burn of pendingBurns) {
        this.schedule(burn.messageId, burn.conversationId, burn.scheduledBurnAt);
      }

      this.fastify.log.info({
        count: pendingBurns.length,
      }, '🔥 Loaded pending burns from database');
    } catch (error: any) {
      this.fastify.log.error({
        error: error.message,
      }, '❌ Failed to load pending burns');
    }
  }

  /**
   * Get statistics about scheduled burns
   */
  getStats() {
    return {
      scheduledCount: this.scheduledBurns.size,
      scheduled: Array.from(this.scheduledBurns.values()).map(burn => ({
        messageId: burn.messageId,
        conversationId: burn.conversationId,
        scheduledBurnAt: new Date(burn.scheduledBurnAt).toISOString(),
        remainingMs: Math.max(0, burn.scheduledBurnAt - Date.now()),
      })),
    };
  }

  /**
   * Cleanup all scheduled burns (for shutdown)
   */
  cleanup() {
    for (const scheduled of this.scheduledBurns.values()) {
      clearTimeout(scheduled.timeoutId);
    }
    this.scheduledBurns.clear();
    
    if (this.fastify) {
      this.fastify.log.info('🔥 Burn Scheduler cleaned up');
    }
  }
}

// Singleton instance
export const burnScheduler = new BurnScheduler();
