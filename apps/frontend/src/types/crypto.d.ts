/**
 * Type definitions for crypto operations
 * Fixes TypeScript strict type checking for Uint8Array
 */

// Extend Uint8Array to be compatible with BufferSource
declare global {
  interface Uint8Array {
    readonly buffer: ArrayBuffer;
  }
}

export {};
