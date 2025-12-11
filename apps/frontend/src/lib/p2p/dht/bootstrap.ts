/**
 * Bootstrap Node Manager
 * 
 * ARCHITECTURE:
 * - Manages connections to bootstrap nodes
 * - Initial peer discovery for DHT entry
 * - Health monitoring of bootstrap nodes
 * - Automatic failover to healthy nodes
 * 
 * DECENTRALIZATION:
 * - Multiple bootstrap nodes supported
 * - Community-run nodes can be added
 * - Fallback to known peers if bootstrap fails
 */

export interface BootstrapNode {
  url: string;
  peerId?: string;
  healthy: boolean;
  lastCheck: number;
  latency: number;
  failedAttempts: number;
}

export interface BootstrapConfig {
  nodes: string[];
  healthCheckInterval: number;
  connectionTimeout: number;
  maxFailedAttempts: number;
}

const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  nodes: [
    // Default bootstrap nodes (would be replaced with actual nodes)
    // These are placeholders for self-hosted bootstrap infrastructure
  ],
  healthCheckInterval: 60000, // 1 minute
  connectionTimeout: 10000, // 10 seconds
  maxFailedAttempts: 3,
};

export class BootstrapManager {
  private config: BootstrapConfig;
  private nodes: Map<string, BootstrapNode> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private onPeerDiscovered?: (peerId: string, addresses: string[]) => void;

  constructor(config: Partial<BootstrapConfig> = {}) {
    this.config = { ...DEFAULT_BOOTSTRAP_CONFIG, ...config };
    
    // Initialize nodes from config
    for (const url of this.config.nodes) {
      this.nodes.set(url, {
        url,
        healthy: true, // Assume healthy until proven otherwise
        lastCheck: 0,
        latency: Infinity,
        failedAttempts: 0,
      });
    }
  }

  /**
   * Set callback for peer discovery
   */
  setOnPeerDiscovered(callback: (peerId: string, addresses: string[]) => void): void {
    this.onPeerDiscovered = callback;
  }

  /**
   * Add a bootstrap node
   */
  addNode(url: string, peerId?: string): void {
    if (this.nodes.has(url)) return;
    
    this.nodes.set(url, {
      url,
      peerId,
      healthy: true,
      lastCheck: 0,
      latency: Infinity,
      failedAttempts: 0,
    });
    
    debugLogger.debug(`➕ [Bootstrap] Added node: ${url}`);
  }

  /**
   * Remove a bootstrap node
   */
  removeNode(url: string): void {
    this.nodes.delete(url);
    debugLogger.debug(`➖ [Bootstrap] Removed node: ${url}`);
  }

  /**
   * Get healthy nodes sorted by latency
   */
  getHealthyNodes(): BootstrapNode[] {
    return Array.from(this.nodes.values())
      .filter(node => node.healthy)
      .sort((a, b) => a.latency - b.latency);
  }

  /**
   * Connect to bootstrap network
   */
  async connect(): Promise<{ connected: number; failed: number }> {
    const nodes = Array.from(this.nodes.values());
    let connected = 0;
    let failed = 0;

    debugLogger.debug(`🔗 [Bootstrap] Connecting to ${nodes.length} nodes...`);

    for (const node of nodes) {
      try {
        const success = await this.connectToNode(node);
        if (success) {
          connected++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.warn(`⚠️ [Bootstrap] Failed to connect to ${node.url}:`, error);
      }
    }

    debugLogger.info('✅ [Bootstrap] Connected: ${connected}, Failed: ${failed}');
    return { connected, failed };
  }

  /**
   * Connect to a specific node
   */
  private async connectToNode(node: BootstrapNode): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check if node is reachable (via HTTP health endpoint)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.connectionTimeout);

      const response = await fetch(`${node.url}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        node.healthy = true;
        node.latency = Date.now() - startTime;
        node.lastCheck = Date.now();
        node.failedAttempts = 0;

        // Try to get peer list
        await this.fetchPeersFromNode(node);
        
        debugLogger.info('✅ [Bootstrap] Connected to ${node.url} (${node.latency}ms)');
        return true;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      node.failedAttempts++;
      node.lastCheck = Date.now();
      
      if (node.failedAttempts >= this.config.maxFailedAttempts) {
        node.healthy = false;
      }

      return false;
    }
  }

  /**
   * Fetch peer list from bootstrap node
   */
  private async fetchPeersFromNode(node: BootstrapNode): Promise<void> {
    try {
      const response = await fetch(`${node.url}/peers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return;

      const data = await response.json();
      
      if (Array.isArray(data.peers)) {
        for (const peer of data.peers) {
          if (peer.id && peer.addresses) {
            this.onPeerDiscovered?.(peer.id, peer.addresses);
          }
        }
        debugLogger.debug(`📥 [Bootstrap] Received ${data.peers.length} peers from ${node.url}`);
      }
    } catch (error) {
      // Peer list fetch is optional, don't fail connection
      console.warn(`⚠️ [Bootstrap] Could not fetch peers from ${node.url}`);
    }
  }

  /**
   * Start health check monitoring
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      for (const node of this.nodes.values()) {
        await this.connectToNode(node);
      }
    }, this.config.healthCheckInterval);

    debugLogger.debug('🏥 [Bootstrap] Started health checks');
  }

  /**
   * Stop health check monitoring
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    debugLogger.debug('⏹️ [Bootstrap] Stopped health checks');
  }

  /**
   * Announce our presence to bootstrap nodes
   */
  async announce(peerId: string, addresses: string[]): Promise<void> {
    const healthyNodes = this.getHealthyNodes();
    
    if (healthyNodes.length === 0) {
      console.warn('⚠️ [Bootstrap] No healthy nodes available for announcement');
      return;
    }

    for (const node of healthyNodes) {
      try {
        await fetch(`${node.url}/announce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId, addresses }),
        });
        debugLogger.debug(`📢 [Bootstrap] Announced to ${node.url}`);
      } catch (error) {
        console.warn(`⚠️ [Bootstrap] Announcement failed to ${node.url}`);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalNodes: number;
    healthyNodes: number;
    avgLatency: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const healthy = nodes.filter(n => n.healthy);
    const avgLatency = healthy.length > 0
      ? healthy.reduce((sum, n) => sum + n.latency, 0) / healthy.length
      : Infinity;

    return {
      totalNodes: nodes.length,
      healthyNodes: healthy.length,
      avgLatency: Math.round(avgLatency),
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopHealthChecks();
    this.nodes.clear();
  }
}

// Singleton instance
let instance: BootstrapManager | null = null;

export function getBootstrapManager(config?: Partial<BootstrapConfig>): BootstrapManager {
  if (!instance) {
    instance = new BootstrapManager(config);
  }
  return instance;
}

export function resetBootstrapManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
