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
const isProd = import.meta.env.PROD;

// Feature flags for granular control
// WARNING: crypto and e2ee should NEVER be enabled in production (security risk)
const DEBUG_FLAGS = {
  crypto: isDev && false,     // ALWAYS false - NEVER log cryptographic material
  e2ee: isDev && false,       // ALWAYS false - NEVER log keys or secrets
  p2p: isDev && true,         // OK in dev - WebRTC debugging
  websocket: isDev && true,   // OK in dev - Connection debugging
  general: isDev && true,     // OK in dev - General debug info
} as const;

// Completely disable ALL debug logs in production (extra safety)
if (isProd) {
  Object.keys(DEBUG_FLAGS).forEach(key => {
    (DEBUG_FLAGS as any)[key] = false;
  });
}

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
