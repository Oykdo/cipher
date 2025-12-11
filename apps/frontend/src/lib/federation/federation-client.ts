/**
 * Federation Client for Server-to-Server Communication
 * 
 * ARCHITECTURE:
 * - Each server maintains its own users
 * - Servers can route messages to users on other servers
 * - No central database - distributed architecture
 * - User addresses format: username@domain
 * 
 * LEGAL NOTE:
 * - Each server operator is responsible for their jurisdiction
 * - No single point of control or censorship
 */

import {
  type FederatedServer,
  type FederatedUser,
  type FederatedMessage,
  type ServerAnnouncement,
  type FederationConfig,
  type FederationEvent,
  type FederationEventType,
  type FederationEventHandler,
  DEFAULT_FEDERATION_CONFIG,
} from './types';

export class FederationClient {
  private config: FederationConfig;
  private knownServers: Map<string, FederatedServer> = new Map();
  private userCache: Map<string, FederatedUser> = new Map();
  private eventHandlers: Map<FederationEventType, Set<FederationEventHandler>> = new Map();
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<FederationConfig> = {}) {
    this.config = { ...DEFAULT_FEDERATION_CONFIG, ...config };
  }

  /**
   * Initialize federation with server identity
   */
  initialize(domain: string, serverId: string): void {
    this.config.myDomain = domain;
    this.config.myServerId = serverId;
    debugLogger.p2p('[Federation]...');
  }

  /**
   * Enable/disable federation
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    
    if (enabled) {
      this.startDiscovery();
    } else {
      this.stopDiscovery();
    }
  }

  /**
   * Start server discovery
   */
  startDiscovery(): void {
    if (!this.config.enabled) return;
    if (this.discoveryTimer) return;

    this.discoveryTimer = setInterval(() => {
      this.discoverServers();
    }, this.config.serverDiscoveryInterval);

    // Initial discovery
    this.discoverServers();
    
    debugLogger.debug('🔍 [Federation] Started server discovery');
  }

  /**
   * Stop server discovery
   */
  stopDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    debugLogger.debug('⏹️ [Federation] Stopped server discovery');
  }

  /**
   * Parse federated user address (username@domain)
   */
  static parseUserAddress(address: string): { username: string; domain: string } | null {
    const parts = address.split('@');
    if (parts.length !== 2) return null;
    return { username: parts[0], domain: parts[1] };
  }

  /**
   * Create federated user address
   */
  static createUserAddress(username: string, domain: string): string {
    return `${username}@${domain}`;
  }

  /**
   * Check if user is on local server
   */
  isLocalUser(userAddress: string): boolean {
    const parsed = FederationClient.parseUserAddress(userAddress);
    return parsed?.domain === this.config.myDomain;
  }

  /**
   * Look up user on federated network
   */
  async lookupUser(userAddress: string): Promise<FederatedUser | null> {
    // Check cache first
    const cached = this.userCache.get(userAddress);
    if (cached && Date.now() - (cached as any).cachedAt < 300000) { // 5 min cache
      return cached;
    }

    const parsed = FederationClient.parseUserAddress(userAddress);
    if (!parsed) return null;

    // If local, handle internally
    if (parsed.domain === this.config.myDomain) {
      return null; // Local lookup should be handled by the app
    }

    // Find server for domain
    const server = await this.getServerForDomain(parsed.domain);
    if (!server) {
      console.warn(`⚠️ [Federation] No server found for domain: ${parsed.domain}`);
      return null;
    }

    // Query remote server
    try {
      const response = await fetch(`${server.endpoints.userLookup}?username=${parsed.username}`, {
        method: 'GET',
        headers: {
          'X-Federation-Origin': this.config.myDomain,
        },
      });

      if (!response.ok) return null;

      const user = await response.json() as FederatedUser;
      this.userCache.set(userAddress, { ...user, cachedAt: Date.now() } as any);
      
      this.emit({
        type: 'user:found',
        data: user,
        timestamp: Date.now(),
      });

      return user;
    } catch (error) {
      console.error(`❌ [Federation] User lookup failed:`, error);
      return null;
    }
  }

  /**
   * Relay message to federated user
   */
  async relayMessage(message: FederatedMessage): Promise<boolean> {
    if (!this.config.enabled) {
      console.warn('⚠️ [Federation] Federation is disabled');
      return false;
    }

    const server = await this.getServerForDomain(message.to.domain);
    if (!server) {
      console.warn(`⚠️ [Federation] No server for domain: ${message.to.domain}`);
      return false;
    }

    try {
      const response = await fetch(server.endpoints.messageRelay, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Federation-Origin': this.config.myDomain,
          'X-Federation-Server-Id': this.config.myServerId,
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        this.emit({
          type: 'message:relayed',
          data: { messageId: message.id, toServer: server.domain },
          timestamp: Date.now(),
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ [Federation] Message relay failed:`, error);
      return false;
    }
  }

  /**
   * Add a trusted server
   */
  addTrustedServer(server: FederatedServer): void {
    this.knownServers.set(server.domain, server);
    
    if (!this.config.trustedDomains.includes(server.domain)) {
      this.config.trustedDomains.push(server.domain);
    }

    this.emit({
      type: 'server:discovered',
      data: server,
      timestamp: Date.now(),
    });

    debugLogger.info('✅ [Federation] Added trusted server: ${server.domain}');
  }

  /**
   * Get server for a domain
   */
  async getServerForDomain(domain: string): Promise<FederatedServer | null> {
    // Check known servers
    const known = this.knownServers.get(domain);
    if (known && known.status !== 'offline') {
      return known;
    }

    // Try to discover via well-known endpoint
    try {
      const response = await fetch(`https://${domain}/.well-known/cipher-pulse-federation`);
      if (response.ok) {
        const announcement = await response.json() as ServerAnnouncement;
        
        const server: FederatedServer = {
          id: announcement.serverId,
          domain: announcement.domain,
          publicKey: announcement.publicKey,
          endpoints: {
            federation: `https://${domain}/federation`,
            userLookup: `https://${domain}/federation/users`,
            messageRelay: `https://${domain}/federation/relay`,
          },
          status: 'active',
          lastSeen: Date.now(),
          trustLevel: this.config.trustedDomains.includes(domain) ? 'trusted' : 'unknown',
        };

        this.knownServers.set(domain, server);
        return server;
      }
    } catch (error) {
      console.warn(`⚠️ [Federation] Could not discover server for ${domain}`);
    }

    return null;
  }

  /**
   * Get all known servers
   */
  getKnownServers(): FederatedServer[] {
    return Array.from(this.knownServers.values());
  }

  /**
   * Subscribe to federation events
   */
  on(eventType: FederationEventType, handler: FederationEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from federation events
   */
  off(eventType: FederationEventType, handler: FederationEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Get federation statistics
   */
  getStats(): {
    enabled: boolean;
    myDomain: string;
    knownServersCount: number;
    trustedServersCount: number;
    cachedUsersCount: number;
  } {
    return {
      enabled: this.config.enabled,
      myDomain: this.config.myDomain,
      knownServersCount: this.knownServers.size,
      trustedServersCount: this.config.trustedDomains.length,
      cachedUsersCount: this.userCache.size,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Discover federated servers
   */
  private async discoverServers(): Promise<void> {
    // Query known servers for their peer list
    for (const server of this.knownServers.values()) {
      if (server.status === 'offline') continue;

      try {
        const response = await fetch(`${server.endpoints.federation}/peers`, {
          headers: {
            'X-Federation-Origin': this.config.myDomain,
          },
        });

        if (response.ok) {
          const data = await response.json();
          for (const peer of data.peers || []) {
            if (!this.knownServers.has(peer.domain)) {
              await this.getServerForDomain(peer.domain);
            }
          }
        }
      } catch (error) {
        // Mark server as potentially degraded
        server.status = 'degraded';
      }
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: FederationEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[Federation] Event handler error:`, error);
        }
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopDiscovery();
    this.knownServers.clear();
    this.userCache.clear();
    this.eventHandlers.clear();
  }
}

// Singleton instance
let instance: FederationClient | null = null;

export function getFederationClient(config?: Partial<FederationConfig>): FederationClient {
  if (!instance) {
    instance = new FederationClient(config);
  }
  return instance;
}

export function resetFederationClient(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
