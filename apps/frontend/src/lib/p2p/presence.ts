/**
 * Decentralized Presence Module
 * 
 * ARCHITECTURE:
 * - P2P heartbeat between contacts (no server needed)
 * - Broadcast presence via active DataChannels
 * - Local cache of contact status
 * - Server fallback only for initial discovery
 * 
 * DECENTRALIZATION:
 * - Presence info shared directly between peers
 * - No central presence server required
 * - Works even if signaling server is down (for existing connections)
 */

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface PeerPresence {
  peerId: string;
  status: PresenceStatus;
  lastSeen: number;
  lastHeartbeat: number;
  customStatus?: string;
  isP2P: boolean; // true if received via P2P, false if from server
}

export interface PresenceConfig {
  heartbeatIntervalMs: number;
  offlineThresholdMs: number;
  awayThresholdMs: number;
  maxCacheAge: number;
}

const DEFAULT_CONFIG: PresenceConfig = {
  heartbeatIntervalMs: 30000, // 30 seconds
  offlineThresholdMs: 90000, // 90 seconds without heartbeat = offline
  awayThresholdMs: 300000, // 5 minutes = away
  maxCacheAge: 24 * 60 * 60 * 1000, // 24 hours
};

export type HeartbeatSender = (peerId: string, presence: { status: PresenceStatus; customStatus?: string }) => Promise<void>;
export type PresenceChangeCallback = (peerId: string, presence: PeerPresence) => void;

export class P2PPresenceManager {
  private config: PresenceConfig;
  private presenceCache: Map<string, PeerPresence> = new Map();
  private myStatus: PresenceStatus = 'online';
  private myCustomStatus?: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private connectedPeers: Set<string> = new Set();
  private sendHeartbeat?: HeartbeatSender;
  private onPresenceChange?: PresenceChangeCallback;

  constructor(config: Partial<PresenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for sending heartbeats via P2P
   */
  setHeartbeatSender(sender: HeartbeatSender): void {
    this.sendHeartbeat = sender;
  }

  /**
   * Set callback for presence changes
   */
  setPresenceChangeCallback(callback: PresenceChangeCallback): void {
    this.onPresenceChange = callback;
  }

  /**
   * Start presence broadcasting
   */
  start(): void {
    this.stop();

    // Send heartbeats periodically
    this.heartbeatTimer = setInterval(() => {
      this.broadcastPresence();
    }, this.config.heartbeatIntervalMs);

    // Check for stale presence data
    this.checkTimer = setInterval(() => {
      this.checkStalePresence();
    }, this.config.heartbeatIntervalMs / 2);

    // Send initial heartbeat
    this.broadcastPresence();

    debugLogger.debug('💓 [Presence] Started P2P presence manager');
  }

  /**
   * Stop presence broadcasting
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    debugLogger.debug('⏹️ [Presence] Stopped P2P presence manager');
  }

  /**
   * Set my presence status
   */
  setMyStatus(status: PresenceStatus, customStatus?: string): void {
    this.myStatus = status;
    this.myCustomStatus = customStatus;
    
    // Broadcast immediately on status change
    this.broadcastPresence();
  }

  /**
   * Get my current status
   */
  getMyStatus(): { status: PresenceStatus; customStatus?: string } {
    return {
      status: this.myStatus,
      customStatus: this.myCustomStatus,
    };
  }

  /**
   * Add a connected peer
   */
  addConnectedPeer(peerId: string): void {
    this.connectedPeers.add(peerId);
    debugLogger.debug(`👤 [Presence] Added connected peer: ${peerId}`);
  }

  /**
   * Remove a disconnected peer
   */
  removeConnectedPeer(peerId: string): void {
    this.connectedPeers.delete(peerId);
    
    // Update presence to offline
    const presence = this.presenceCache.get(peerId);
    if (presence) {
      presence.status = 'offline';
      presence.isP2P = false;
      this.onPresenceChange?.(peerId, presence);
    }
    
    debugLogger.debug(`👤 [Presence] Removed connected peer: ${peerId}`);
  }

  /**
   * Receive heartbeat from peer
   */
  receiveHeartbeat(peerId: string, data: { status: PresenceStatus; customStatus?: string }): void {
    const now = Date.now();
    
    const presence: PeerPresence = {
      peerId,
      status: data.status,
      lastSeen: now,
      lastHeartbeat: now,
      customStatus: data.customStatus,
      isP2P: true,
    };

    const previous = this.presenceCache.get(peerId);
    this.presenceCache.set(peerId, presence);

    // Notify if status changed
    if (!previous || previous.status !== presence.status) {
      debugLogger.debug(`💓 [Presence] Peer ${peerId} is now ${presence.status}`);
      this.onPresenceChange?.(peerId, presence);
    }
  }

  /**
   * Update presence from server (fallback)
   */
  updateFromServer(peerId: string, online: boolean): void {
    const now = Date.now();
    const existing = this.presenceCache.get(peerId);

    // Don't override P2P presence with server data if recent
    if (existing?.isP2P && (now - existing.lastHeartbeat) < this.config.offlineThresholdMs) {
      return;
    }

    const presence: PeerPresence = {
      peerId,
      status: online ? 'online' : 'offline',
      lastSeen: now,
      lastHeartbeat: now,
      isP2P: false,
    };

    this.presenceCache.set(peerId, presence);

    if (!existing || existing.status !== presence.status) {
      this.onPresenceChange?.(peerId, presence);
    }
  }

  /**
   * Get presence for a peer
   */
  getPresence(peerId: string): PeerPresence | null {
    const presence = this.presenceCache.get(peerId);
    if (!presence) return null;

    // Check if stale
    const now = Date.now();
    const timeSinceHeartbeat = now - presence.lastHeartbeat;

    if (timeSinceHeartbeat > this.config.offlineThresholdMs) {
      return { ...presence, status: 'offline' };
    }

    if (timeSinceHeartbeat > this.config.awayThresholdMs && presence.status === 'online') {
      return { ...presence, status: 'away' };
    }

    return presence;
  }

  /**
   * Get all known presences
   */
  getAllPresences(): PeerPresence[] {
    const result: PeerPresence[] = [];
    
    for (const [peerId] of this.presenceCache) {
      const presence = this.getPresence(peerId);
      if (presence) {
        result.push(presence);
      }
    }

    return result;
  }

  /**
   * Get online peers count
   */
  getOnlineCount(): number {
    return this.getAllPresences().filter(p => p.status === 'online' || p.status === 'away').length;
  }

  /**
   * Check if peer is online
   */
  isPeerOnline(peerId: string): boolean {
    const presence = this.getPresence(peerId);
    return presence?.status === 'online' || presence?.status === 'away' || presence?.status === 'busy';
  }

  /**
   * Broadcast presence to all connected peers
   */
  private async broadcastPresence(): Promise<void> {
    if (!this.sendHeartbeat || this.connectedPeers.size === 0) {
      return;
    }

    const presence = {
      status: this.myStatus,
      customStatus: this.myCustomStatus,
    };

    for (const peerId of this.connectedPeers) {
      try {
        await this.sendHeartbeat(peerId, presence);
      } catch (error) {
        console.warn(`⚠️ [Presence] Failed to send heartbeat to ${peerId}:`, error);
      }
    }
  }

  /**
   * Check for stale presence data and update status
   */
  private checkStalePresence(): void {
    const now = Date.now();

    for (const [peerId, presence] of this.presenceCache) {
      const timeSinceHeartbeat = now - presence.lastHeartbeat;
      let newStatus: PresenceStatus = presence.status;

      if (timeSinceHeartbeat > this.config.offlineThresholdMs) {
        newStatus = 'offline';
      } else if (timeSinceHeartbeat > this.config.awayThresholdMs && presence.status === 'online') {
        newStatus = 'away';
      }

      if (newStatus !== presence.status) {
        presence.status = newStatus;
        this.onPresenceChange?.(peerId, presence);
      }

      // Clean up very old entries
      if (timeSinceHeartbeat > this.config.maxCacheAge) {
        this.presenceCache.delete(peerId);
      }
    }
  }

  /**
   * Clear all presence data
   */
  clear(): void {
    this.presenceCache.clear();
    this.connectedPeers.clear();
  }

  /**
   * Get presence statistics
   */
  getStats(): {
    totalCached: number;
    online: number;
    away: number;
    busy: number;
    offline: number;
    p2pConnections: number;
  } {
    const presences = this.getAllPresences();
    
    return {
      totalCached: this.presenceCache.size,
      online: presences.filter(p => p.status === 'online').length,
      away: presences.filter(p => p.status === 'away').length,
      busy: presences.filter(p => p.status === 'busy').length,
      offline: presences.filter(p => p.status === 'offline').length,
      p2pConnections: this.connectedPeers.size,
    };
  }
}

// Singleton instance
let instance: P2PPresenceManager | null = null;

export function getPresenceManager(config?: Partial<PresenceConfig>): P2PPresenceManager {
  if (!instance) {
    instance = new P2PPresenceManager(config);
  }
  return instance;
}

export function resetPresenceManager(): void {
  if (instance) {
    instance.stop();
    instance.clear();
    instance = null;
  }
}
