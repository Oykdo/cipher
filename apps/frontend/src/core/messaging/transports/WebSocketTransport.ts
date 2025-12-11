/**
 * WebSocket Transport Implementation
 * 
 * Fallback transport using Socket.IO
 * 
 * @module WebSocketTransport
 */

import type { MessageTransport, Message, TransportMetrics } from '../MessageTransport';
import { logger } from '@/core/logger';

export class WebSocketTransport implements MessageTransport {
  readonly name = 'WebSocket';
  readonly priority = 50; // Lower priority than P2P

  private socket: any = null;
  // TODO: Implement message callback when Socket.IO integration is complete
  // private _messageCallback: ((message: Message) => void) | null = null;
  private metrics: TransportMetrics = {
    latency: 0,
    successRate: 1.0,
  };
  private connected = false;

  async initialize(): Promise<void> {
    logger.info('WebSocket Transport initializing');

    // Note: In real implementation, this would use the socket from useSocketWithRefresh
    // For now, we mark it as available but not connected
    this.connected = false;

    logger.info('WebSocket Transport initialized (fallback mode)');
  }

  async send(message: Message): Promise<void> {
    const startTime = Date.now();

    try {
      // TODO: Implement actual WebSocket send via Socket.IO
      // For now, throw error to force P2P usage
      throw new Error('WebSocket transport not yet implemented');

      // Future implementation:
      // this.socket.emit('send_message', message);
      
      const latency = Date.now() - startTime;
      this.updateMetrics(latency, true);

      logger.debug('WebSocket message sent', {
        messageId: message.id,
        latency,
      });
    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false, error as Error);
      throw error;
    }
  }

  onMessage(_callback: (message: Message) => void): void {
    // this._messageCallback = callback;

    // TODO: Register Socket.IO listener
    // this.socket.on('new_message', callback);
  }

  isAvailable(): boolean {
    // WebSocket is always available as fallback
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  destroy(): void {
    logger.info('WebSocket Transport destroying');
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }

  // Private methods

  private updateMetrics(latency: number, success: boolean, error?: Error): void {
    this.metrics.latency = latency;

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
