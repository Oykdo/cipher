/**
 * Message Transport Interface
 * 
 * PATTERN: Strategy Pattern
 * Allows switching between P2P, WebSocket, and future transports
 * 
 * @module MessageTransport
 */

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  timestamp: number;
  encrypted: boolean;
}

export interface TransportMetrics {
  latency: number;
  successRate: number;
  lastError?: Error;
  lastSuccess?: number;
}

/**
 * Base interface for all message transports
 */
export interface MessageTransport {
  /**
   * Transport name for logging
   */
  readonly name: string;

  /**
   * Priority (higher = preferred)
   */
  readonly priority: number;

  /**
   * Initialize transport
   */
  initialize(): Promise<void>;

  /**
   * Send a message
   */
  send(message: Message): Promise<void>;

  /**
   * Register message handler
   */
  onMessage(callback: (message: Message) => void): void;

  /**
   * Check if transport is available
   */
  isAvailable(): boolean;

  /**
   * Check if transport is connected
   */
  isConnected(): boolean;

  /**
   * Get transport metrics
   */
  getMetrics(): TransportMetrics;

  /**
   * Cleanup and disconnect
   */
  destroy(): void;
}

/**
 * Transport status for monitoring
 */
export interface TransportStatus {
  name: string;
  available: boolean;
  connected: boolean;
  priority: number;
  metrics: TransportMetrics;
}
