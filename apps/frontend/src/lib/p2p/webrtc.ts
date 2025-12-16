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
import { debugLogger } from "../debugLogger";
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
  private signalHandler: ((data: any) => void) | null = null;
  private signalingSocket: any = null; // Stocker la référence au socket pour nettoyage
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: P2PConnectionOptions) {
    this.options = options;
  }

  /**
   * Initialize WebRTC connection
   */
  async initialize(signalingSocket: any): Promise<void> {
      // SECURITY: Do not log peer IDs
      debugLogger.websocket('[P2P] Initializing connection', {
      initiator: this.options.initiator,
    });

    // Stocker la référence au socket pour le nettoyage
    this.signalingSocket = signalingSocket;

    // CORRECTION: Enregistrer le handler AVANT de créer le peer
    // pour pouvoir recevoir les signaux même si le peer n'est pas encore créé
    this.signalHandler = (data: any) => {
      if (data.from === this.options.peerId) {
        // SECURITY: Do not log peer IDs or signal content
        debugLogger.debug('📡 [P2P] Received signal', {
          type: data.signal?.type || 'unknown',
          isInitiator: this.options.initiator,
        });
        
        // Si le peer n'existe pas encore, attendre un peu
        if (!this.peer) {
          // SECURITY: Do not log peer IDs
          console.warn('⚠️ [P2P] Received signal but peer not initialized yet, will process when ready');
          // Stocker le signal pour le traiter plus tard
          setTimeout(() => {
            if (this.peer && data.signal) {
              try {
                this.peer.signal(data.signal);
              } catch (error) {
                console.error('❌ [P2P] Error processing delayed signal', error);
              }
            }
          }, 100);
          return;
        }
        
        try {
          this.peer.signal(data.signal);
        } catch (error) {
          console.error('❌ [P2P] Error processing signal', error);
          this.options.onError?.(error as Error);
        }
      }
    };

    // Listen for signals from peer (register BEFORE creating peer)
    signalingSocket.on('p2p-signal', this.signalHandler);

    this.peer = new SimplePeer({
      initiator: this.options.initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      },
    });

    // Setup WebRTC logging - SimplePeer crée _pc de manière asynchrone
    const setupWebRTCLogging = () => {
      const checkInterval = setInterval(() => {
        const pc = (this.peer as any)?._pc as RTCPeerConnection | undefined;
        if (pc) {
          clearInterval(checkInterval);
      
      // Log ICE connection state
      pc.addEventListener('iceconnectionstatechange', () => {
        // SECURITY: Do not log peer IDs
        debugLogger.p2p(`[P2P] ICE connection state: ${pc.iceConnectionState}`, {
          state: pc.iceConnectionState,
        });
        
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.error('❌ [P2P] ICE connection failed', {
            state: pc.iceConnectionState,
          });
          this.options.onError?.(new Error(`ICE connection ${pc.iceConnectionState}`));
        }
      });

      // Log ICE gathering state
      pc.addEventListener('icegatheringstatechange', () => {
        // SECURITY: Do not log peer IDs
        debugLogger.p2p(`[P2P] ICE gathering state: ${pc.iceGatheringState}`, {
          state: pc.iceGatheringState,
        });
      });

      // Log connection state
      pc.addEventListener('connectionstatechange', () => {
        // SECURITY: Do not log peer IDs
        debugLogger.p2p(`[P2P] Connection state: ${pc.connectionState}`, {
          state: pc.connectionState,
        });
        
        if (pc.connectionState === 'failed') {
          console.error('❌ [P2P] Peer connection failed');
          this.options.onError?.(new Error('Peer connection failed'));
        }
      });

          // Log ICE candidates
          pc.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
              // SECURITY: Do not log candidate details or peer IDs - they contain network information
              debugLogger.p2p(`[P2P] ICE candidate received`, {
                type: event.candidate.type,
              });
            } else {
              // SECURITY: Do not log peer IDs
              debugLogger.p2p(`[P2P] ICE gathering complete`);
            }
          });
        }
      }, 100);
      
      // Timeout après 5 secondes si _pc n'est pas créé
      setTimeout(() => clearInterval(checkInterval), 5000);
    };

    setupWebRTCLogging();

    // Handle signaling
    this.peer.on('signal', (signal) => {
      // SECURITY: Do not log SDP content - it may contain sensitive network information
      debugLogger.debug('📡 [P2P] Sending signal', {
        type: signal.type || 'unknown',
        isInitiator: this.options.initiator,
      });
      signalingSocket.emit('p2p-signal', {
        to: this.options.peerId,
        signal,
      });
    });

    // Handle connection established
    this.peer.on('connect', () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      // SECURITY: Do not log peer IDs
      debugLogger.info('✅ [P2P] Connected to peer');
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
        
        // SECURITY: Do not log message IDs - they could be used for tracking
        debugLogger.debug('📨 [P2P] Received message', {
          type: message.type,
        });
        
        this.options.onMessage?.(message);
      } catch (error) {
        console.error('❌ [P2P] Failed to process message', error);
        this.options.onError?.(error as Error);
      }
    });

    // Handle disconnection
    this.peer.on('close', () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      // SECURITY: Do not log peer IDs
      debugLogger.websocket('[P2P] Connection closed');
      this.connected = false;
      this.options.onDisconnect?.();
    });

    // Handle errors
    this.peer.on('error', (error) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      // SECURITY: Do not log peer IDs
      console.error('❌ [P2P] Connection error', {
        error: error.message || 'Unknown error',
        isInitiator: this.options.initiator,
      });
      this.options.onError?.(error);
    });

    // Timeout de connexion (30 secondes)
    this.connectionTimeout = setTimeout(() => {
      if (!this.connected) {
        // SECURITY: Do not log peer IDs
        console.error('❌ [P2P] Connection timeout');
        this.options.onError?.(new Error('Connection timeout after 30 seconds'));
        this.destroy();
      }
    }, 30000);
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
      debugLogger.debug('⏳ [P2P] Queueing message (not connected yet)');
      this.messageQueue.push({
        ...message,
        timestamp,
        messageId,
      });
      return;
    }

    // Vérifier l'état de connexion (SimplePeer gère le canal de données en interne)
    if (!this.peer || !this.connected) {
      // SECURITY: Do not log peer IDs
      debugLogger.warn('⚠️ [P2P] Peer not connected, queueing message');
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
        envelope = {
          version: 'p2p-e2ee-v1',
          type: message.type,
          payload: message.payload,
          timestamp,
          messageId,
        };
      }
      
      // Send via WebRTC Data Channel (SimplePeer gère le canal de données)
      this.peer.send(JSON.stringify(envelope));
      
      // SECURITY: Do not log message IDs
      debugLogger.debug('📤 [P2P] Sent message', {
        type: message.type,
      });
    } catch (error) {
      console.error('❌ [P2P] Failed to send message', error);
      // Si l'envoi échoue mais qu'on est connecté, remettre en queue
      if (this.connected) {
        this.messageQueue.push({
          ...message,
          timestamp,
          messageId,
        });
      }
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
    // SECURITY: Do not log peer IDs
    debugLogger.websocket('[P2P] Destroying connection');
    
    // Nettoyer le timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Retirer le listener de signalisation
    if (this.signalHandler && this.signalingSocket) {
      this.signalingSocket.off('p2p-signal', this.signalHandler);
      // SECURITY: Do not log peer IDs
      debugLogger.debug('🧹 [P2P] Removed signal listener');
    }
    
    this.peer?.destroy();
    this.peer = null;
    this.connected = false;
    this.messageQueue = [];
    this.signalHandler = null;
    this.signalingSocket = null;
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

    debugLogger.debug(`📤 [P2P] Flushing ${this.messageQueue.length} queued messages`);
    
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
