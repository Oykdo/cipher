/**
 * DHT Manager for Decentralized Peer Discovery
 * 
 * ARCHITECTURE:
 * - Kademlia-inspired DHT for peer discovery
 * - Bootstrap nodes for initial network entry
 * - WebRTC transport for browser compatibility
 * - Local routing table with XOR distance metric
 * 
 * DECENTRALIZATION:
 * - No central server required after bootstrap
 * - Peers discover each other through DHT
 * - Routing table maintained locally
 * 
 * PRIVACY WARNING:
 * - DHT exposes hashed peer IDs publicly
 * - Opt-in participation (disabled by default)
 * - No personal data in DHT records
 */

import {
  type DHTConfig,
  type PeerInfo,
  type RoutingTableEntry,
  type DHTEvent,
  type DHTEventHandler,
  type DHTEventType,
  DEFAULT_DHT_CONFIG,
} from './types';

const DB_NAME = 'cipher-pulse-dht';
const ROUTING_STORE = 'routing-table';
const PEERS_STORE = 'known-peers';
const DB_VERSION = 1;

export class DHTManager {
  private config: DHTConfig;
  private myPeerId: string = '';
  private routingTable: Map<string, RoutingTableEntry> = new Map();
  private knownPeers: Map<string, PeerInfo> = new Map();
  private eventHandlers: Map<DHTEventType, Set<DHTEventHandler>> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private db: IDBDatabase | null = null;

  constructor(config: Partial<DHTConfig> = {}) {
    this.config = { ...DEFAULT_DHT_CONFIG, ...config };
  }

  /**
   * Initialize DHT with peer ID
   */
  async initialize(peerId: string): Promise<void> {
    this.myPeerId = peerId;
    
    // Open IndexedDB for persistent storage
    await this.openDatabase();
    
    // Load routing table from storage
    await this.loadRoutingTable();
    
    // SECURITY: Sensitive log removed
  }

  /**
   * Start DHT participation
   */
  async start(): Promise<void> {
    if (!this.config.participateInDHT) {
      debugLogger.debug('⚠️ [DHT] Participation disabled (opt-in required);');
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;

    // Connect to bootstrap nodes
    await this.connectToBootstrapNodes();

    // Start periodic refresh
    this.refreshTimer = setInterval(() => {
      this.refreshRoutingTable();
    }, this.config.refreshInterval);

    this.emit({ type: 'dht:ready', timestamp: Date.now() });
    debugLogger.debug('🚀 [DHT] Started');
  }

  /**
   * Stop DHT participation
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.isRunning = false;
    debugLogger.debug('⏹️ [DHT] Stopped');
  }

  /**
   * Enable/disable DHT participation
   */
  setParticipation(enabled: boolean): void {
    this.config.participateInDHT = enabled;
    
    if (enabled && !this.isRunning) {
      this.start();
    } else if (!enabled && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Find peer by ID in DHT
   */
  async findPeer(peerId: string): Promise<PeerInfo | null> {
    // Check local cache first
    const cached = this.knownPeers.get(peerId);
    if (cached && Date.now() - cached.lastSeen < 300000) { // 5 min cache
      return cached;
    }

    // Check routing table
    const routingEntry = this.routingTable.get(peerId);
    if (routingEntry) {
      return {
        id: peerId,
        addresses: routingEntry.addresses,
        lastSeen: routingEntry.lastSeen,
      };
    }

    // Query closest peers
    if (this.config.participateInDHT) {
      return this.queryDHT(peerId);
    }

    return null;
  }

  /**
   * Announce presence to DHT
   */
  async announce(addresses: string[]): Promise<void> {
    if (!this.config.participateInDHT) return;

    const myInfo: PeerInfo = {
      id: this.myPeerId,
      addresses,
      lastSeen: Date.now(),
    };

    // Store locally
    this.knownPeers.set(this.myPeerId, myInfo);
    await this.savePeer(myInfo);

    // Announce to closest peers in routing table
    const closestPeers = this.getClosestPeers(this.myPeerId, this.config.kBucketSize);
    
    debugLogger.debug(`📢 [DHT] Announcing to ${closestPeers.length} closest peers`);
  }

  /**
   * Add peer to routing table
   */
  async addPeer(peerInfo: PeerInfo): Promise<void> {
    const distance = this.calculateDistance(this.myPeerId, peerInfo.id);
    
    const entry: RoutingTableEntry = {
      peerId: peerInfo.id,
      distance,
      lastSeen: Date.now(),
      addresses: peerInfo.addresses,
      failedAttempts: 0,
    };

    // Check if bucket is full
    const bucketIndex = this.getBucketIndex(distance);
    const bucketPeers = this.getPeersInBucket(bucketIndex);

    if (bucketPeers.length >= this.config.kBucketSize) {
      // Evict oldest/least responsive peer
      const toEvict = bucketPeers.reduce((a, b) => 
        a.failedAttempts > b.failedAttempts ? a : 
        (a.lastSeen < b.lastSeen ? a : b)
      );
      this.routingTable.delete(toEvict.peerId);
    }

    this.routingTable.set(peerInfo.id, entry);
    this.knownPeers.set(peerInfo.id, peerInfo);
    
    await this.saveRoutingTable();
    
    this.emit({
      type: 'peer:discovered',
      peerId: peerInfo.id,
      data: peerInfo,
      timestamp: Date.now(),
    });

    // SECURITY: Sensitive log removed`);
  }

  /**
   * Remove peer from routing table
   */
  async removePeer(peerId: string): Promise<void> {
    this.routingTable.delete(peerId);
    await this.saveRoutingTable();
    
    this.emit({
      type: 'peer:disconnected',
      peerId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get closest peers to a target ID
   */
  getClosestPeers(targetId: string, count: number): RoutingTableEntry[] {
    const entries = Array.from(this.routingTable.values());
    
    return entries
      .map(entry => ({
        ...entry,
        distanceToTarget: this.calculateDistance(entry.peerId, targetId),
      }))
      .sort((a, b) => a.distanceToTarget - b.distanceToTarget)
      .slice(0, count);
  }

  /**
   * Get all known peers
   */
  getAllPeers(): PeerInfo[] {
    return Array.from(this.knownPeers.values());
  }

  /**
   * Get routing table size
   */
  getRoutingTableSize(): number {
    return this.routingTable.size;
  }

  /**
   * Subscribe to DHT events
   */
  on(eventType: DHTEventType, handler: DHTEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from DHT events
   */
  off(eventType: DHTEventType, handler: DHTEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Get DHT statistics
   */
  getStats(): {
    peerId: string;
    routingTableSize: number;
    knownPeersCount: number;
    isRunning: boolean;
    participatingInDHT: boolean;
    bootstrapNodesCount: number;
  } {
    return {
      peerId: this.myPeerId,
      routingTableSize: this.routingTable.size,
      knownPeersCount: this.knownPeers.size,
      isRunning: this.isRunning,
      participatingInDHT: this.config.participateInDHT,
      bootstrapNodesCount: this.config.bootstrapNodes.length,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Open IndexedDB database
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains(ROUTING_STORE)) {
          db.createObjectStore(ROUTING_STORE, { keyPath: 'peerId' });
        }
        if (!db.objectStoreNames.contains(PEERS_STORE)) {
          db.createObjectStore(PEERS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load routing table from IndexedDB
   */
  private async loadRoutingTable(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUTING_STORE, 'readonly');
      const store = tx.objectStore(ROUTING_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        for (const entry of request.result as RoutingTableEntry[]) {
          this.routingTable.set(entry.peerId, entry);
        }
        debugLogger.debug(`📂 [DHT] Loaded ${this.routingTable.size} peers from storage`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save routing table to IndexedDB
   */
  private async saveRoutingTable(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUTING_STORE, 'readwrite');
      const store = tx.objectStore(ROUTING_STORE);

      // Clear and repopulate
      store.clear();
      for (const entry of this.routingTable.values()) {
        store.put(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Save peer info to IndexedDB
   */
  private async savePeer(peer: PeerInfo): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(PEERS_STORE, 'readwrite');
      const store = tx.objectStore(PEERS_STORE);
      store.put(peer);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Connect to bootstrap nodes
   */
  private async connectToBootstrapNodes(): Promise<void> {
    if (this.config.bootstrapNodes.length === 0) {
      debugLogger.debug('⚠️ [DHT] No bootstrap nodes configured');
      return;
    }

    debugLogger.debug(`🔗 [DHT] Connecting to ${this.config.bootstrapNodes.length} bootstrap nodes`);
    
    // In a full implementation, this would establish connections
    // For now, we'll just log and prepare for peer exchange
    for (const node of this.config.bootstrapNodes) {
      debugLogger.debug(`  → ${node}`);
    }
  }

  /**
   * Query DHT for peer info
   */
  private async queryDHT(targetPeerId: string): Promise<PeerInfo | null> {
    // Get closest peers to query
    const closestPeers = this.getClosestPeers(targetPeerId, 3);
    
    if (closestPeers.length === 0) {
      return null;
    }

    // In a full implementation, this would query each peer
    // For now, return null as we'd need actual network connections
    // SECURITY: Sensitive log removed
    
    return null;
  }

  /**
   * Refresh routing table
   */
  private async refreshRoutingTable(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    // Remove stale entries
    for (const [peerId, entry] of this.routingTable) {
      if (now - entry.lastSeen > staleThreshold && entry.failedAttempts > 3) {
        this.routingTable.delete(peerId);
        // SECURITY: Sensitive log removed
      }
    }

    await this.saveRoutingTable();
    
    this.emit({
      type: 'routing:updated',
      data: { size: this.routingTable.size },
      timestamp: now,
    });
  }

  /**
   * Calculate XOR distance between two peer IDs
   */
  private calculateDistance(id1: string, id2: string): number {
    // Simple hash-based distance for browser compatibility
    const hash1 = this.hashString(id1);
    const hash2 = this.hashString(id2);
    
    return hash1 ^ hash2;
  }

  /**
   * Get bucket index for a distance value
   */
  private getBucketIndex(distance: number): number {
    if (distance === 0) return 0;
    return Math.floor(Math.log2(distance));
  }

  /**
   * Get peers in a specific bucket
   */
  private getPeersInBucket(bucketIndex: number): RoutingTableEntry[] {
    return Array.from(this.routingTable.values()).filter(entry => {
      const entryBucket = this.getBucketIndex(entry.distance);
      return entryBucket === bucketIndex;
    });
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Emit event to handlers
   */
  private emit(event: DHTEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[DHT] Event handler error:`, error);
        }
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.routingTable.clear();
    this.knownPeers.clear();
    this.eventHandlers.clear();
    this.db?.close();
    this.db = null;
  }
}

// Singleton instance
let instance: DHTManager | null = null;

export function getDHTManager(config?: Partial<DHTConfig>): DHTManager {
  if (!instance) {
    instance = new DHTManager(config);
  }
  return instance;
}

export function resetDHTManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
