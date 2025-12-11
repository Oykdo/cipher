/**
 * P2P Connection Manager
 * 
 * ARCHITECTURE: Manages multiple P2P connections
 * - One connection per conversation
 * - Automatic reconnection on disconnect
 * - Message queueing for offline peers
 * 
 * FEATURES:
 * - Multi-peer support
 * - Presence detection
 * - Store & forward for offline peers
 * - Automatic queue processing when peer comes online
 */

import { P2PConnection, P2PMessage } from './webrtc';
import { SignalingClient } from './signaling-client';
import { StoreForwardQueue, getStoreForwardQueue, type QueuedMessage } from './store-forward';
import { P2PPresenceManager, getPresenceManager, type PresenceStatus, type PeerPresence } from './presence';
import { P2PKeyExchange, getKeyExchange, type KeyBundle, type KeyExchangeMessage } from './key-exchange';

import { debugLogger } from "../debugLogger";
export interface P2PManagerOptions {
  signalingUrl: string;
  signalingUrls?: string[]; // Multiple servers for failover
  userId: string;
  authToken?: string; // JWT token for signaling authentication
  // ARCHITECTURE FIX: Removed masterKey - P2P now uses unified E2EE via peerUsername
  onMessage?: (conversationId: string, message: P2PMessage) => void;
  onPeerStatusChange?: (peerId: string, online: boolean) => void;
  onServerSwitch?: (oldUrl: string, newUrl: string) => void;
  // Store & Forward callbacks
  onQueuedMessageSent?: (messageId: string) => void;
  onServerFallback?: (peerId: string, conversationId: string, encryptedPayload: string) => Promise<boolean>;
  // Presence callback
  onPresenceChange?: (peerId: string, presence: PeerPresence) => void;
  // Key exchange callbacks
  onKeyBundleReceived?: (peerId: string, bundle: KeyBundle) => void;
  getMyKeyBundle?: () => Promise<KeyBundle | null>;
}

export class P2PManager {
  private signalingClient: SignalingClient;
  private connections: Map<string, P2PConnection> = new Map();
  private options: P2PManagerOptions;
  private onlinePeers: Set<string> = new Set();
  private messageQueue: StoreForwardQueue;
  private presenceManager: P2PPresenceManager;
  private keyExchange: P2PKeyExchange;

  constructor(options: P2PManagerOptions) {
    this.options = options;
    
    this.signalingClient = new SignalingClient({
      url: options.signalingUrl,
      urls: options.signalingUrls,
      userId: options.userId,
      authToken: options.authToken,
      onPeerAvailable: (peerId) => this.handlePeerAvailable(peerId),
      onPeerUnavailable: (peerId) => this.handlePeerUnavailable(peerId),
      onServerSwitch: options.onServerSwitch,
    });

    // Initialize Store & Forward queue
    this.messageQueue = getStoreForwardQueue();
    this.setupQueueCallbacks();

    // Initialize Presence Manager
    this.presenceManager = getPresenceManager();
    this.setupPresenceCallbacks();

    // Initialize Key Exchange
    this.keyExchange = getKeyExchange();
    this.setupKeyExchangeCallbacks();
  }

  /**
   * Setup Key Exchange callbacks
   */
  private setupKeyExchangeCallbacks(): void {
    // Callback for sending key exchange messages
    this.keyExchange.setSendCallback(async (peerId, message) => {
      for (const [key, connection] of this.connections) {
        if (key.startsWith(`${peerId}:`) && connection.isConnected()) {
          await connection.sendKeyExchange(message);
          return;
        }
      }
      throw new Error('No active connection to peer');
    });

    // Callback for providing own key bundle
    if (this.options.getMyKeyBundle) {
      this.keyExchange.setKeyBundleProvider(this.options.getMyKeyBundle);
    }

    // Callback when key bundle is received
    this.keyExchange.setKeyBundleReceiver((peerId, bundle) => {
      this.options.onKeyBundleReceived?.(peerId, bundle);
    });
  }

  /**
   * Setup Presence Manager callbacks
   */
  private setupPresenceCallbacks(): void {
    // Callback for sending presence heartbeats
    this.presenceManager.setHeartbeatSender(async (peerId, presence) => {
      // Find any connection for this peer and send presence
      for (const [key, connection] of this.connections) {
        if (key.startsWith(`${peerId}:`) && connection.isConnected()) {
          await connection.sendPresence(presence.status, presence.customStatus);
          return;
        }
      }
    });

    // Callback for presence changes
    this.presenceManager.setPresenceChangeCallback((peerId, presence) => {
      this.options.onPresenceChange?.(peerId, presence);
    });
  }

  /**
   * Setup Store & Forward queue callbacks
   */
  private setupQueueCallbacks(): void {
    // Callback for sending queued messages via P2P
    this.messageQueue.onSend(async (message: QueuedMessage) => {
      try {
        const connectionKey = this.getConnectionKey(message.peerId, message.conversationId);
        const connection = this.connections.get(connectionKey);
        
        if (connection?.isConnected()) {
          await connection.sendText(message.encryptedPayload);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    });

    // Callback for server fallback
    this.messageQueue.onFallback(async (message: QueuedMessage) => {
      if (this.options.onServerFallback) {
        return this.options.onServerFallback(
          message.peerId,
          message.conversationId,
          message.encryptedPayload
        );
      }
      return false;
    });

    // Callback when message is sent
    this.messageQueue.onMessageSent((messageId: string) => {
      this.options.onQueuedMessageSent?.(messageId);
    });
  }

  /**
   * Get signaling client for health monitoring
   */
  getSignalingClient(): SignalingClient {
    return this.signalingClient;
  }

  /**
   * Initialize P2P manager
   */
  async initialize(): Promise<void> {
    debugLogger.debug('🚀 [P2P MANAGER] Initializing');
    
    // Connect to signaling server (non-blocking - P2P works without it)
    try {
      await this.signalingClient.connect();
      // Notify availability only if connected
      if (this.signalingClient.isConnected()) {
        this.signalingClient.notifyAvailable();
      }
    } catch (error) {
      console.warn('⚠️ [P2P MANAGER] Signaling connection failed, continuing in degraded mode');
    }
    
    // Start Store & Forward retry processor
    this.messageQueue.startRetryProcessor();

    // Start presence broadcasting
    this.presenceManager.start();
    
    debugLogger.info('✅ [P2P MANAGER] Initialized');
  }

  /**
   * Get the message queue for external access
   */
  getMessageQueue(): StoreForwardQueue {
    return this.messageQueue;
  }

  /**
   * Get the presence manager for external access
   */
  getPresenceManager(): P2PPresenceManager {
    return this.presenceManager;
  }

  /**
   * Set my presence status
   */
  setMyPresence(status: PresenceStatus, customStatus?: string): void {
    this.presenceManager.setMyStatus(status, customStatus);
  }

  /**
   * Get peer presence
   */
  getPeerPresence(peerId: string): PeerPresence | null {
    return this.presenceManager.getPresence(peerId);
  }

  /**
   * Get the key exchange manager for external access
   */
  getKeyExchange(): P2PKeyExchange {
    return this.keyExchange;
  }

  /**
   * Request key bundle from peer via P2P
   */
  async requestKeyBundle(peerId: string): Promise<KeyBundle> {
    return this.keyExchange.requestKeyBundle(peerId);
  }

  /**
   * Connect to a peer for a conversation
   * 
   * ARCHITECTURE FIX: Now requires peerUsername for unified E2EE
   * @param peerId - The peer's user ID
   * @param peerUsername - The peer's username (required for E2EE session)
   * @param conversationId - The conversation ID
   * @param initiator - Whether we're initiating the connection
   */
  async connectToPeer(
    peerId: string,
    peerUsername: string,
    conversationId: string,
    initiator: boolean
  ): Promise<void> {
    const connectionKey = this.getConnectionKey(peerId, conversationId);
    
    // Check if already connected
    if (this.connections.has(connectionKey)) {
      debugLogger.debug('⚠️ [P2P MANAGER] Already connected to peer', peerId);
      return;
    }

    debugLogger.websocket('[P2P MANAGER]...', {
      peerId,
      peerUsername,
      conversationId,
      initiator,
    });

    // Create P2P connection with unified E2EE
    const connection = new P2PConnection({
      initiator,
      peerId,
      peerUsername, // ARCHITECTURE FIX: Use peerUsername for E2EE instead of masterKey
      conversationId,
      onMessage: (message) => {
        // Handle presence messages internally
        if (message.type === 'presence') {
          this.presenceManager.receiveHeartbeat(peerId, message.payload);
          return;
        }
        // Handle key exchange messages internally
        if (message.type === 'key_exchange') {
          this.keyExchange.handleMessage(peerId, message.payload as KeyExchangeMessage);
          return;
        }
        this.options.onMessage?.(conversationId, message);
      },
      onConnect: () => {
        debugLogger.info('✅ [P2P MANAGER] Connected to peer', peerId);
        this.onlinePeers.add(peerId);
        this.presenceManager.addConnectedPeer(peerId);
        this.options.onPeerStatusChange?.(peerId, true);
      },
      onDisconnect: () => {
        debugLogger.websocket('[P2P MANAGER]...', peerId);
        this.onlinePeers.delete(peerId);
        this.presenceManager.removeConnectedPeer(peerId);
        this.options.onPeerStatusChange?.(peerId, false);
        this.connections.delete(connectionKey);
      },
      onError: (error) => {
        console.error('❌ [P2P MANAGER] Connection error', error);
      },
    });

    // Initialize connection
    const socket = this.signalingClient.getSocket();
    if (!socket) {
      throw new Error('Signaling client not connected');
    }

    await connection.initialize(socket);
    this.connections.set(connectionKey, connection);
  }

  /**
   * Send message to peer (with Store & Forward for offline peers)
   * 
   * ARCHITECTURE FIX: Now requires peerUsername for unified E2EE
   */
  async sendMessage(
    peerId: string,
    peerUsername: string,
    conversationId: string,
    text: string,
    options: { queueIfOffline?: boolean } = {}
  ): Promise<{ sent: boolean; queued: boolean; messageId?: string }> {
    const { queueIfOffline = true } = options;
    const connectionKey = this.getConnectionKey(peerId, conversationId);
    let connection = this.connections.get(connectionKey);

    // Try to establish connection if not exists
    if (!connection && this.isPeerOnline(peerId)) {
      debugLogger.debug('⚠️ [P2P MANAGER] No connection to peer, initiating...');
      try {
        await this.connectToPeer(peerId, peerUsername, conversationId, true);
        connection = this.connections.get(connectionKey);
      } catch (error) {
        console.warn('⚠️ [P2P MANAGER] Failed to connect to peer:', error);
      }
    }

    // Try to send directly if connected
    if (connection?.isConnected()) {
      try {
        await connection.sendText(text);
        return { sent: true, queued: false };
      } catch (error) {
        console.warn('⚠️ [P2P MANAGER] Direct send failed:', error);
      }
    }

    // Queue message for later delivery if peer is offline
    if (queueIfOffline) {
      debugLogger.debug('📦 [P2P MANAGER] Peer offline, queueing message');
      const messageId = await this.messageQueue.queueMessage(peerId, conversationId, text);
      return { sent: false, queued: true, messageId };
    }

    throw new Error('Peer is offline and queueing is disabled');
  }

  /**
   * Queue a message without attempting direct send
   */
  async queueMessage(
    peerId: string,
    conversationId: string,
    encryptedPayload: string
  ): Promise<string> {
    return this.messageQueue.queueMessage(peerId, conversationId, encryptedPayload);
  }

  /**
   * Send typing indicator
   */
  async sendTyping(
    peerId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> {
    const connectionKey = this.getConnectionKey(peerId, conversationId);
    const connection = this.connections.get(connectionKey);

    if (!connection || !connection.isConnected()) {
      return; // Don't establish connection just for typing
    }

    await connection.sendTyping(isTyping);
  }

  /**
   * Check if peer is online
   */
  isPeerOnline(peerId: string): boolean {
    return this.onlinePeers.has(peerId);
  }

  /**
   * Get all online peers
   */
  getOnlinePeers(): string[] {
    return Array.from(this.onlinePeers);
  }

  /**
   * Disconnect from peer
   */
  disconnectFromPeer(peerId: string, conversationId: string): void {
    const connectionKey = this.getConnectionKey(peerId, conversationId);
    const connection = this.connections.get(connectionKey);

    if (connection) {
      connection.destroy();
      this.connections.delete(connectionKey);
    }
  }

  /**
   * Disconnect all and cleanup
   */
  destroy(): void {
    debugLogger.websocket('[P2P MANAGER]...');
    
    // Stop Store & Forward retry processor
    this.messageQueue.stopRetryProcessor();

    // Stop presence broadcasting
    this.presenceManager.stop();

    // Clear key exchange
    this.keyExchange.clear();
    
    // Disconnect all peers
    for (const connection of this.connections.values()) {
      connection.destroy();
    }
    this.connections.clear();
    
    // Notify unavailability
    this.signalingClient.notifyUnavailable();
    
    // Disconnect signaling
    this.signalingClient.disconnect();
    
    this.onlinePeers.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Handle peer becoming available
   */
  private async handlePeerAvailable(peerId: string): Promise<void> {
    debugLogger.debug('👤 [P2P MANAGER] Peer available', peerId);
    this.onlinePeers.add(peerId);
    this.options.onPeerStatusChange?.(peerId, true);

    // Process queued messages for this peer
    try {
      const sentCount = await this.messageQueue.processPeerOnline(peerId);
      if (sentCount > 0) {
        debugLogger.debug(`📤 [P2P MANAGER] Sent ${sentCount} queued messages to peer ${peerId}`);
      }
    } catch (error) {
      console.error('❌ [P2P MANAGER] Failed to process queued messages:', error);
    }
  }

  /**
   * Handle peer becoming unavailable
   */
  private handlePeerUnavailable(peerId: string): void {
    debugLogger.debug('👤 [P2P MANAGER] Peer unavailable', peerId);
    this.onlinePeers.delete(peerId);
    this.options.onPeerStatusChange?.(peerId, false);
  }

  /**
   * Generate connection key
   */
  private getConnectionKey(peerId: string, conversationId: string): string {
    return `${peerId}:${conversationId}`;
  }
}
