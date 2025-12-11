/**
 * Debug Logger - Conditional logging for development
 * 
 * Usage:
 *   import { debugLogger } from '@/lib/debugLogger';
 *   debugLogger.crypto('Shared secret generated', { prefix: '...' });
 * 
 * All debug logs are DISABLED in production builds automatically.
 */

const isDev = import.meta.env.DEV;

// Feature flags for granular control
const DEBUG_FLAGS = {
  crypto: isDev && false, // ALWAYS false for security
  e2ee: isDev && false,   // ALWAYS false for security
  p2p: isDev && false,
  websocket: isDev && false,
  general: isDev && false,
} as const;

export const debugLogger = {
  /**
   * Cryptographic operations (NEVER log keys, secrets, or prefixes in production)
   */
  crypto: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.crypto) {
      console.log(`🔐 [CRYPTO]`, message, ...args);
    }
  },

  /**
   * E2EE operations (session management, key exchange)
   */
  e2ee: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.e2ee) {
      console.log(`🔒 [E2EE]`, message, ...args);
    }
  },

  /**
   * P2P operations (WebRTC, signaling)
   */
  p2p: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.p2p) {
      console.log(`🌐 [P2P]`, message, ...args);
    }
  },

  /**
   * WebSocket operations
   */
  websocket: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.websocket) {
      console.log(`🔌 [WS]`, message, ...args);
    }
  },

  /**
   * General debug logs
   */
  debug: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.general) {
      console.log(`🐛 [DEBUG]`, message, ...args);
    }
  },

  /**
   * Info logs (OK in production - for operational visibility)
   */
  info: (message: string, ...args: any[]) => {
    console.log(`ℹ️`, message, ...args);
  },

  /**
   * Warning logs (OK in production)
   */
  warn: (message: string, ...args: any[]) => {
    console.warn(`⚠️`, message, ...args);
  },

  /**
   * Error logs (OK in production)
   */
  error: (message: string, error?: any) => {
    console.error(`❌`, message, error);
  },
};

/**
 * SECURITY NOTE:
 * Never log cryptographic material (keys, secrets, signatures, or even prefixes).
 * Even in development, use session IDs or anonymous identifiers instead.
 */
