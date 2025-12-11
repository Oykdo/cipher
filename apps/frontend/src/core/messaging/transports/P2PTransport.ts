/**
 * P2P Transport Implementation
 * 
 * Uses WebRTC Data Channels for direct peer-to-peer messaging
 * 
 * ARCHITECTURE FIX: P2P now uses unified E2EE (Double Ratchet) via peerUsername,
 * ensuring compatibility with server relay transport.
 * 
 * @module P2PTransport
 */

import type { MessageTransport, Message, TransportMetrics } from '../MessageTransport';
import { P2PManager } from '@/lib/p2p/p2p-manager';
import type { P2PMessage } from '@/lib/p2p/webrtc';
import { logger } from '@/core/logger';

export class P2PTransport implements MessageTransport {
  readonly name = 'P2P';
  readonly priority = 100; // Highest priority

  private manager: P2PManager | null = null;
  private messageCallback: ((message: Message) => void) | null = null;
  private metrics: TransportMetrics = {
    latency: 0,
    successRate: 1.0,
  };
  private initialized = false;

  constructor(
    private userId: string,
    private signalingUrl: string
    // ARCHITECTURE FIX: masterKey removed - E2EE handled via peerUsername per message
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('P2P Transport initializing (unified E2EE)', { userId: this.userId });

      this.manager = new P2PManager({
        signalingUrl: this.signalingUrl,
        userId: this.userId,
        // ARCHITECTURE FIX: masterKey removed - E2EE handled via peerUsername
        onMessage: (conversationId, p2pMessage) => {
          this.handleP2PMessage(conversationId, p2pMessage);
        },
        onPeerStatusChange: (peerId, online) => {
          logger.debug('P2P peer status changed', { peerId, online });
        },
      });

      await this.manager.initialize();
      this.initialized = true;

      logger.info('P2P Transport initialized');
    } catch (error) {
      logger.error('P2P Transport initialization failed', error as Error);
      throw error;
    }
  }

  /**
   * Send message via P2P
   * 
   * ARCHITECTURE FIX: Now requires recipientUsername for unified E2EE.
   * Message interface must include recipientUsername field.
   */
  async send(message: Message & { recipientUsername?: string }): Promise<void> {
    if (!this.manager) {
      throw new Error('P2P Transport not initialized');
    }

    if (!message.recipientUsername) {
      throw new Error('P2P Transport requires recipientUsername for unified E2EE');
    }

    const startTime = Date.now();

    try {
      await this.manager.sendMessage(
        message.recipientId,
        message.recipientUsername,
        message.conversationId,
        message.body
      );

      // Update metrics
      const latency = Date.now() - startTime;
      this.updateMetrics(latency, true);

      logger.debug('P2P message sent (unified E2EE)', {
        messageId: message.id,
        latency,
      });
    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  onMessage(callback: (message: Message) => void): void {
    this.messageCallback = callback;
  }

  isAvailable(): boolean {
    return this.initialized && this.manager !== null;
  }

  isConnected(): boolean {
    // Check if we have at least one active P2P connection
    return this.isAvailable();
  }

  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  destroy(): void {
    logger.info('P2P Transport destroying');
    this.manager?.destroy();
    this.manager = null;
    this.initialized = false;
  }

  // Private methods

  private handleP2PMessage(conversationId: string, p2pMessage: P2PMessage): void {
    if (p2pMessage.type !== 'text' || !this.messageCallback) {
      return;
    }

    const message: Message = {
      id: p2pMessage.messageId,
      conversationId,
      senderId: '', // Will be filled by caller
      recipientId: this.userId,
      body: p2pMessage.payload.text,
      timestamp: p2pMessage.timestamp,
      encrypted: true,
    };

    this.messageCallback(message);
  }

  private updateMetrics(latency: number, success: boolean, error?: Error): void {
    this.metrics.latency = latency;

    // Update success rate (exponential moving average)
    const alpha = 0.1;
    this.metrics.successRate =
      alpha * (success ? 1 : 0) + (1 - alpha) * this.metrics.successRate;

    if (success) {
      this.metrics.lastSuccess = Date.now();
      delete this.metrics.lastError;
    } else {
      this.metrics.lastError = error;
    }
  }
}
