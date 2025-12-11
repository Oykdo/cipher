/**
 * WebRTC P2P Connection Manager
 * 
 * ARCHITECTURE: Pure P2P communication via WebRTC Data Channels
 * - Direct peer-to-peer messaging
 * - No server intermediary for messages
 * - End-to-end encrypted by default (DTLS)
 * 
 * SECURITY:
 * - WebRTC native encryption (DTLS/SRTP)
 * - UNIFIED E2EE: Uses the same Double Ratchet as server relay
 * - Perfect Forward Secrecy via Double Ratchet protocol
 * 
 * ARCHITECTURE FIX: P2P now uses the same E2EE system as relay transport,
 * ensuring messages can be decrypted regardless of transport method.
 */

import SimplePeer from 'simple-peer';
import {
  encryptMessageForPeer,
  decryptMessageFromPeer,
  isE2EEInitialized,
} from '../e2ee/e2eeService';

export interface P2PMessage {
  type: 'text' | 'ack' | 'typing' | 'presence' | 'key_exchange';
  payload: any;
  timestamp: number;
  messageId: string;
  signature?: string;
}

/**
 * Envelope for P2P transport
 * Contains both the E2EE encrypted payload and metadata
 */
export interface P2PEnvelope {
  version: 'p2p-e2ee-v1';
  type: P2PMessage['type'];
  encryptedPayload?: any;  // E2EE encrypted (for 'text' messages)
  payload?: any;           // Plain (for control messages like typing, presence)
  timestamp: number;
  messageId: string;
}

export interface P2PConnectionOptions {
  initiator: boolean;
  peerId: string;
  peerUsername: string;    // REQUIRED: For E2EE session lookup
  conversationId: string;
  onMessage?: (message: P2PMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class P2PConnection {
  private peer: SimplePeer.Instance | null = null;
  private options: P2PConnectionOptions;
  private connected = false;
  private messageQueue: P2PMessage[] = [];

  constructor(options: P2PConnectionOptions) {
    this.options = options;
  }

  /**
   * Initialize WebRTC connection
   */
  async initialize(signalingSocket: any): Promise<void> {
    console.log('🔌 [P2P] Initializing WebRTC connection', {
      initiator: this.options.initiator,
      peerId: this.options.peerId,
    });

    this.peer = new SimplePeer({
      initiator: this.options.initiator,
      trickle: true, // Send ICE candidates as they arrive
      config: {
        iceServers: [
          // Public STUN servers for NAT traversal
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // TODO: Add TURN servers for strict NAT
        ],
      },
    });

    // Handle signaling
    this.peer.on('signal', (signal) => {
      console.log('📡 [P2P] Sending signal to peer', this.options.peerId);
      signalingSocket.emit('p2p-signal', {
        to: this.options.peerId,
        signal,
      });
    });

    // Handle connection established
    this.peer.on('connect', () => {
      console.log('✅ [P2P] Connected to peer', this.options.peerId);
      this.connected = true;
      this.options.onConnect?.();
      
      // Send queued messages
      this.flushMessageQueue();
    });

    // Handle incoming data
    this.peer.on('data', async (data) => {
      try {
        const envelope: P2PEnvelope = JSON.parse(data.toString());
        
        // Validate envelope version
        if (envelope.version !== 'p2p-e2ee-v1') {
          console.warn('⚠️ [P2P] Unknown envelope version:', envelope.version);
          return;
        }
        
        let message: P2PMessage;
        
        // For text messages, decrypt using unified E2EE
        if (envelope.type === 'text' && envelope.encryptedPayload) {
          const decryptedText = await this.decryptTextMessage(envelope.encryptedPayload);
          message = {
            type: 'text',
            payload: { text: decryptedText },
            timestamp: envelope.timestamp,
            messageId: envelope.messageId,
          };
        } else {
          // Control messages (typing, presence, ack, key_exchange) - not E2EE encrypted
          message = {
            type: envelope.type,
            payload: envelope.payload,
            timestamp: envelope.timestamp,
            messageId: envelope.messageId,
          };
        }
        
        console.log('📨 [P2P] Received message', {
          type: message.type,
          messageId: message.messageId,
        });
        
        this.options.onMessage?.(message);
      } catch (error) {
        console.error('❌ [P2P] Failed to process message', error);
        this.options.onError?.(error as Error);
      }
    });

    // Handle disconnection
    this.peer.on('close', () => {
      console.log('🔌 [P2P] Disconnected from peer', this.options.peerId);
      this.connected = false;
      this.options.onDisconnect?.();
    });

    // Handle errors
    this.peer.on('error', (error) => {
      console.error('❌ [P2P] Connection error', error);
      this.options.onError?.(error);
    });

    // Listen for signals from peer
    signalingSocket.on('p2p-signal', (data: any) => {
      if (data.from === this.options.peerId) {
        console.log('📡 [P2P] Received signal from peer', this.options.peerId);
        this.peer?.signal(data.signal);
      }
    });
  }

  /**
   * Send message to peer using unified E2EE
   * 
   * ARCHITECTURE: Text messages are encrypted with Double Ratchet E2EE,
   * same as server relay. Control messages are sent without E2EE
   * (they don't contain sensitive data and shouldn't advance the ratchet).
   */
  async sendMessage(message: Omit<P2PMessage, 'timestamp' | 'messageId'>): Promise<void> {
    const timestamp = Date.now();
    const messageId = this.generateMessageId();

    if (!this.connected) {
      console.log('⏳ [P2P] Queueing message (not connected yet)');
      this.messageQueue.push({
        ...message,
        timestamp,
        messageId,
      });
      return;
    }

    try {
      let envelope: P2PEnvelope;

      // For text messages, use unified E2EE (Double Ratchet)
      if (message.type === 'text' && message.payload?.text) {
        const encryptedPayload = await this.encryptTextMessage(message.payload.text);
        envelope = {
          version: 'p2p-e2ee-v1',
          type: 'text',
          encryptedPayload,
          timestamp,
          messageId,
        };
      } else {
        // Control messages (typing, presence, ack, key_exchange) - send without E2EE
        // These don't contain sensitive data and shouldn't advance the ratchet
        envelope = {
          version: 'p2p-e2ee-v1',
          type: message.type,
          payload: message.payload,
          timestamp,
          messageId,
        };
      }
      
      // Send via WebRTC Data Channel
      this.peer?.send(JSON.stringify(envelope));
      
      console.log('📤 [P2P] Sent message', {
        type: message.type,
        messageId,
      });
    } catch (error) {
      console.error('❌ [P2P] Failed to send message', error);
      throw error;
    }
  }

  /**
   * Send text message
   */
  async sendText(text: string): Promise<void> {
    await this.sendMessage({
      type: 'text',
      payload: { text },
    });
  }

  /**
   * Send typing indicator
   */
  async sendTyping(isTyping: boolean): Promise<void> {
    await this.sendMessage({
      type: 'typing',
      payload: { isTyping },
    });
  }

  /**
   * Send acknowledgment
   */
  async sendAck(messageId: string): Promise<void> {
    await this.sendMessage({
      type: 'ack',
      payload: { messageId },
    });
  }

  /**
   * Send presence heartbeat
   */
  async sendPresence(status: string, customStatus?: string): Promise<void> {
    await this.sendMessage({
      type: 'presence',
      payload: { status, customStatus },
    });
  }

  /**
   * Send key exchange message
   */
  async sendKeyExchange(keyExchangeMessage: any): Promise<void> {
    await this.sendMessage({
      type: 'key_exchange',
      payload: keyExchangeMessage,
    });
  }

  /**
   * Close connection
   */
  destroy(): void {
    console.log('🔌 [P2P] Destroying connection', this.options.peerId);
    this.peer?.destroy();
    this.peer = null;
    this.connected = false;
    this.messageQueue = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // PRIVATE METHODS - UNIFIED E2EE
  // ============================================================================

  /**
   * Encrypt text message using unified E2EE (Double Ratchet)
   * 
   * IMPORTANT: This uses the same encryption as server relay,
   * ensuring interoperability between transport methods.
   */
  private async encryptTextMessage(plaintext: string): Promise<any> {
    if (!isE2EEInitialized()) {
      throw new Error('E2EE not initialized - cannot encrypt P2P message');
    }
    
    // Use the same encryption as server relay
    return encryptMessageForPeer(this.options.peerUsername, plaintext);
  }

  /**
   * Decrypt text message using unified E2EE (Double Ratchet)
   * 
   * IMPORTANT: This uses the same decryption as server relay,
   * ensuring interoperability between transport methods.
   */
  private async decryptTextMessage(encrypted: any): Promise<string> {
    if (!isE2EEInitialized()) {
      throw new Error('E2EE not initialized - cannot decrypt P2P message');
    }
    
    // Use the same decryption as server relay
    return decryptMessageFromPeer(this.options.peerUsername, encrypted);
  }

  /**
   * Flush queued messages after connection
   */
  private async flushMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    console.log(`📤 [P2P] Flushing ${this.messageQueue.length} queued messages`);
    
    for (const message of this.messageQueue) {
      try {
        // Re-send using the unified sendMessage method
        await this.sendMessage({
          type: message.type,
          payload: message.payload,
        });
      } catch (error) {
        console.error('❌ [P2P] Failed to send queued message', error);
      }
    }
    
    this.messageQueue = [];
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
