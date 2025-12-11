import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';

export interface RateLimiterConfig {
  timeWindow: number | string; // Time window in ms or string like '1 minute'
  max: number;                  // Max requests per timeWindow
}

/**
 * Create a rate limiter configuration
 * @param windowMs - Time window in milliseconds
 * @param maxRequests - Maximum requests allowed in the time window
 */
export function createRateLimiter(
  windowMsOrConfig: number | { maxRequests?: number; windowMs?: number; max?: number; timeWindow?: number | string },
  maxRequests?: number
): RateLimiterConfig | FastifyPluginAsync {
  // Handle two signatures:
  // 1. createRateLimiter(windowMs, maxRequests) - for index.ts
  // 2. createRateLimiter({maxRequests, windowMs}) - for presentation routes
  
  if (typeof windowMsOrConfig === 'object') {
    // Object form
    const config = windowMsOrConfig;
    const timeWindow = config.windowMs || config.timeWindow || 60000;
    const max = config.maxRequests || config.max || 10;
    
    const plugin: FastifyPluginAsync = async (fastify) => {
      await fastify.register(rateLimit, { timeWindow, max });
    };
    return plugin;
  }
  
  // Simple form (windowMs, maxRequests)
  return {
    timeWindow: windowMsOrConfig,
    max: maxRequests || 10
  };
}
