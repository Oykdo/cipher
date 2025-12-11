/**
 * Message Router
 * 
 * PATTERN: Strategy Pattern + Chain of Responsibility
 * Routes messages through available transports with automatic fallback
 * 
 * @module MessageRouter
 */

import type { MessageTransport, Message, TransportStatus } from './MessageTransport';
import { logger } from '@/core/logger';

export interface MessageRouterConfig {
  /**
   * Maximum retry attempts per transport
   */
  maxRetries?: number;

  /**
   * Timeout for send operation (ms)
   */
  sendTimeout?: number;

  /**
   * Enable automatic fallback
   */
  autoFallback?: boolean;
}

export class MessageRouter {
  private transports: MessageTransport[] = [];
  private config: Required<MessageRouterConfig>;
  private messageCallbacks: Set<(message: Message) => void> = new Set();

  constructor(config: MessageRouterConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      sendTimeout: config.sendTimeout ?? 10000,
      autoFallback: config.autoFallback ?? true,
    };

    logger.info('MessageRouter initialized', this.config);
  }

  /**
   * Register a transport
   */
  registerTransport(transport: MessageTransport): void {
    this.transports.push(transport);

    // Sort by priority (highest first)
    this.transports.sort((a, b) => b.priority - a.priority);

    // Register message handler
    transport.onMessage((message) => {
      this.handleIncomingMessage(message);
    });

    logger.info('Transport registered', {
      name: transport.name,
      priority: transport.priority,
    });
  }

  /**
   * Initialize all transports
   */
  async initialize(): Promise<void> {
    logger.info('Initializing all transports');

    const results = await Promise.allSettled(
      this.transports.map((t) => t.initialize())
    );

    results.forEach((result, index) => {
      const transport = this.transports[index];
      if (result.status === 'rejected') {
        logger.error(`Transport ${transport.name} initialization failed`, result.reason);
      } else {
        logger.info(`Transport ${transport.name} initialized`);
      }
    });
  }

  /**
   * Send message with automatic fallback
   */
  async send(message: Message): Promise<void> {
    const availableTransports = this.getAvailableTransports();

    if (availableTransports.length === 0) {
      throw new Error('No transports available');
    }

    logger.debug('Sending message', {
      messageId: message.id,
      transports: availableTransports.map((t) => t.name),
    });

    // Try each transport in order of priority
    for (const transport of availableTransports) {
      try {
        await this.sendWithRetry(transport, message);
        
        logger.info('Message sent successfully', {
          messageId: message.id,
          transport: transport.name,
        });

        return; // Success!
      } catch (error) {
        logger.warn(`Transport ${transport.name} failed`, {
          messageId: message.id,
          error: (error as Error).message,
        });

        // If auto-fallback disabled, throw error
        if (!this.config.autoFallback) {
          throw error;
        }

        // Continue to next transport
        continue;
      }
    }

    // All transports failed
    throw new Error('All transports failed to send message');
  }

  /**
   * Register message callback
   */
  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.add(callback);
  }

  /**
   * Get status of all transports
   */
  getTransportStatus(): TransportStatus[] {
    return this.transports.map((transport) => ({
      name: transport.name,
      available: transport.isAvailable(),
      connected: transport.isConnected(),
      priority: transport.priority,
      metrics: transport.getMetrics(),
    }));
  }

  /**
   * Get preferred transport
   */
  getPreferredTransport(): MessageTransport | null {
    const available = this.getAvailableTransports();
    return available[0] || null;
  }

  /**
   * Cleanup all transports
   */
  destroy(): void {
    logger.info('MessageRouter destroying');
    this.transports.forEach((t) => t.destroy());
    this.transports = [];
    this.messageCallbacks.clear();
  }

  // Private methods

  private getAvailableTransports(): MessageTransport[] {
    return this.transports.filter((t) => t.isAvailable());
  }

  private async sendWithRetry(
    transport: MessageTransport,
    message: Message
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Send with timeout
        await this.sendWithTimeout(transport, message);
        return; // Success!
      } catch (error) {
        lastError = error as Error;

        logger.debug(`Transport ${transport.name} attempt ${attempt} failed`, {
          messageId: message.id,
          error: lastError.message,
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Send failed');
  }

  private async sendWithTimeout(
    transport: MessageTransport,
    message: Message
  ): Promise<void> {
    return Promise.race([
      transport.send(message),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Send timeout')),
          this.config.sendTimeout
        )
      ),
    ]);
  }

  private handleIncomingMessage(message: Message): void {
    logger.debug('Message received', { messageId: message.id });

    // Notify all callbacks
    this.messageCallbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        logger.error('Message callback error', error as Error);
      }
    });
  }
}
