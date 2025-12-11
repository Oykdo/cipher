/**
 * Signaling Server Entry Point
 * 
 * USAGE:
 * - Can run standalone or integrated with main server
 * - Minimal resource usage
 * - Stateless (can scale horizontally)
 */

export { SignalingServer } from './server.js';
export type { SignalingServerOptions } from './server.js';
