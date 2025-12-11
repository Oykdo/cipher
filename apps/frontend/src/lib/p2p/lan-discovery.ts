/**
 * LAN Discovery Module for Local Network Mesh
 * 
 * ARCHITECTURE:
 * - Discover peers on local network without internet
 * - Use WebRTC with local ICE candidates
 * - Broadcast presence via local signaling
 * - Fallback for offline/restricted networks
 * 
 * USE CASES:
 * - Office networks
 * - Schools without internet access
 * - Emergency/disaster scenarios
 * - Privacy-focused local communication
 * 
 * BROWSER LIMITATIONS:
 * - Cannot use mDNS directly from browser
 * - Requires local relay server or WebSocket broadcast
 * - Can detect local peers via WebRTC ICE candidates
 */

export interface LANPeer {
  id: string;
  username?: string;
  localAddress: string;
  lastSeen: number;
  signalData?: unknown;
}

export interface LANConfig {
  enabled: boolean;
  broadcastPort: number;
  discoveryInterval: number;
  peerTimeout: number;
  localRelayUrl?: string;
}

const DEFAULT_LAN_CONFIG: LANConfig = {
  enabled: false,
  broadcastPort: 4001,
  discoveryInterval: 5000, // 5 seconds
  peerTimeout: 30000, // 30 seconds
  localRelayUrl: undefined,
};

export type LANEventType = 
  | 'peer:discovered'
  | 'peer:lost'
  | 'lan:ready'
  | 'lan:error';

export interface LANEvent {
  type: LANEventType;
  peer?: LANPeer;
  error?: Error;
  timestamp: number;
}

export type LANEventHandler = (event: LANEvent) => void;

export class LANDiscovery {
  private config: LANConfig;
  private myPeerId: string = '';
  private myUsername: string = '';
  private discoveredPeers: Map<string, LANPeer> = new Map();
  private eventHandlers: Map<LANEventType, Set<LANEventHandler>> = new Map();
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private localRelay: WebSocket | null = null;
  private isRunning = false;

  constructor(config: Partial<LANConfig> = {}) {
    this.config = { ...DEFAULT_LAN_CONFIG, ...config };
  }

  /**
   * Initialize LAN discovery with peer identity
   */
  initialize(peerId: string, username?: string): void {
    this.myPeerId = peerId;
    this.myUsername = username || '';
    // SECURITY: Sensitive log removed
  }

  /**
   * Start LAN discovery
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      debugLogger.debug('⚠️ [LAN] LAN discovery is disabled');
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;

    // Connect to local relay if configured
    if (this.config.localRelayUrl) {
      await this.connectToLocalRelay();
    }

    // Start periodic discovery
    this.discoveryTimer = setInterval(() => {
      this.broadcastPresence();
    }, this.config.discoveryInterval);

    // Start cleanup of stale peers
    this.cleanupTimer = setInterval(() => {
      this.cleanupStalePeers();
    }, this.config.peerTimeout / 2);

    // Initial broadcast
    this.broadcastPresence();

    this.emit({ type: 'lan:ready', timestamp: Date.now() });
    debugLogger.debug('🚀 [LAN] Started discovery');
  }

  /**
   * Stop LAN discovery
   */
  stop(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.disconnectFromLocalRelay();
    this.isRunning = false;
    
    debugLogger.debug('⏹️ [LAN] Stopped discovery');
  }

  /**
   * Enable/disable LAN discovery
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (enabled && !this.isRunning) {
      this.start();
    } else if (!enabled && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Get all discovered LAN peers
   */
  getDiscoveredPeers(): LANPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Get peer by ID
   */
  getPeer(peerId: string): LANPeer | null {
    return this.discoveredPeers.get(peerId) || null;
  }

  /**
   * Check if peer is on LAN
   */
  isPeerOnLAN(peerId: string): boolean {
    const peer = this.discoveredPeers.get(peerId);
    if (!peer) return false;
    return Date.now() - peer.lastSeen < this.config.peerTimeout;
  }

  /**
   * Send signal to LAN peer (for WebRTC connection)
   */
  async sendSignal(peerId: string, signal: unknown): Promise<boolean> {
    if (!this.localRelay || this.localRelay.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ [LAN] No local relay connection');
      return false;
    }

    try {
      this.localRelay.send(JSON.stringify({
        type: 'signal',
        from: this.myPeerId,
        to: peerId,
        signal,
      }));
      return true;
    } catch (error) {
      console.error('❌ [LAN] Failed to send signal:', error);
      return false;
    }
  }

  /**
   * Subscribe to LAN events
   */
  on(eventType: LANEventType, handler: LANEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from LAN events
   */
  off(eventType: LANEventType, handler: LANEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Get LAN discovery statistics
   */
  getStats(): {
    enabled: boolean;
    isRunning: boolean;
    discoveredPeersCount: number;
    hasLocalRelay: boolean;
  } {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      discoveredPeersCount: this.discoveredPeers.size,
      hasLocalRelay: this.localRelay?.readyState === WebSocket.OPEN,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Connect to local relay server
   */
  private async connectToLocalRelay(): Promise<void> {
    if (!this.config.localRelayUrl) return;

    return new Promise((resolve, reject) => {
      try {
        this.localRelay = new WebSocket(this.config.localRelayUrl!);

        this.localRelay.onopen = () => {
          debugLogger.info('✅ [LAN] Connected to local relay');
          // Announce ourselves
          this.broadcastPresence();
          resolve();
        };

        this.localRelay.onmessage = (event) => {
          this.handleRelayMessage(event.data);
        };

        this.localRelay.onclose = () => {
          debugLogger.websocket('[LAN]...');
          this.localRelay = null;
          
          // Try to reconnect after delay
          if (this.isRunning) {
            setTimeout(() => this.connectToLocalRelay(), 5000);
          }
        };

        this.localRelay.onerror = (error) => {
          console.error('❌ [LAN] Local relay error:', error);
          reject(error);
        };

        // Timeout
        setTimeout(() => {
          if (this.localRelay?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from local relay
   */
  private disconnectFromLocalRelay(): void {
    if (this.localRelay) {
      this.localRelay.close();
      this.localRelay = null;
    }
  }

  /**
   * Handle message from local relay
   */
  private handleRelayMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'announce':
          this.handlePeerAnnounce(message);
          break;
        case 'signal':
          if (message.to === this.myPeerId) {
            // Handle incoming signal for WebRTC
            debugLogger.debug(`📨 [LAN] Received signal from ${message.from}`);
          }
          break;
        case 'peers':
          // List of current peers from relay
          for (const peer of message.peers || []) {
            this.addPeer(peer);
          }
          break;
      }
    } catch (error) {
      console.error('❌ [LAN] Failed to parse relay message:', error);
    }
  }

  /**
   * Handle peer announcement
   */
  private handlePeerAnnounce(message: any): void {
    if (message.peerId === this.myPeerId) return; // Ignore self

    const peer: LANPeer = {
      id: message.peerId,
      username: message.username,
      localAddress: message.localAddress || '',
      lastSeen: Date.now(),
    };

    this.addPeer(peer);
  }

  /**
   * Add or update peer
   */
  private addPeer(peer: LANPeer): void {
    const existing = this.discoveredPeers.get(peer.id);
    
    peer.lastSeen = Date.now();
    this.discoveredPeers.set(peer.id, peer);

    if (!existing) {
      this.emit({
        type: 'peer:discovered',
        peer,
        timestamp: Date.now(),
      });
      // SECURITY: Sensitive log removed`);
    }
  }

  /**
   * Broadcast our presence
   */
  private broadcastPresence(): void {
    if (!this.localRelay || this.localRelay.readyState !== WebSocket.OPEN) {
      return;
    }

    this.localRelay.send(JSON.stringify({
      type: 'announce',
      peerId: this.myPeerId,
      username: this.myUsername,
      timestamp: Date.now(),
    }));
  }

  /**
   * Clean up stale peers
   */
  private cleanupStalePeers(): void {
    const now = Date.now();

    for (const [peerId, peer] of this.discoveredPeers) {
      if (now - peer.lastSeen > this.config.peerTimeout) {
        this.discoveredPeers.delete(peerId);
        
        this.emit({
          type: 'peer:lost',
          peer,
          timestamp: now,
        });
        
        // SECURITY: Sensitive log removed
      }
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: LANEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[LAN] Event handler error:`, error);
        }
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.discoveredPeers.clear();
    this.eventHandlers.clear();
  }
}

// Singleton instance
let instance: LANDiscovery | null = null;

export function getLANDiscovery(config?: Partial<LANConfig>): LANDiscovery {
  if (!instance) {
    instance = new LANDiscovery(config);
  }
  return instance;
}

export function resetLANDiscovery(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
