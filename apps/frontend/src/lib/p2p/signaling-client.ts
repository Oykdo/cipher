/**
 * Signaling Client for WebRTC with Multi-Server Failover
 * 
 * ARCHITECTURE: Minimal ephemeral signaling with redundancy
 * - Only used for initial WebRTC handshake
 * - Connection closed after P2P established
 * - No message content passes through server
 * - Automatic failover to backup servers
 * - Health monitoring of connected server
 * 
 * PRIVACY:
 * - Server never sees message content
 * - Only SDP/ICE candidates exchanged
 * - Can be routed via Tor (future)
 * 
 * DECENTRALIZATION:
 * - Multiple signaling servers for resilience
 * - Community-run servers supported
 * - No single point of failure
 */

import { io, Socket } from 'socket.io-client';

import { debugLogger } from "../debugLogger";
export interface SignalingServerHealth {
  url: string;
  healthy: boolean;
  latency: number;
  lastCheck: number;
}

export interface SignalingClientOptions {
  url: string;
  urls?: string[]; // Multiple servers for failover
  userId: string;
  authToken?: string; // JWT token for authentication
  onPeerAvailable?: (peerId: string) => void;
  onPeerUnavailable?: (peerId: string) => void;
  onServerSwitch?: (oldUrl: string, newUrl: string) => void;
  connectionTimeout?: number;
  healthCheckInterval?: number;
}

export class SignalingClient {
  private socket: Socket | null = null;
  private options: SignalingClientOptions;
  private connected = false;
  private currentServerUrl: string = '';
  private serverHealth: Map<string, SignalingServerHealth> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(options: SignalingClientOptions) {
    this.options = {
      connectionTimeout: 5000,
      healthCheckInterval: 30000,
      ...options,
    };
    
    // Initialize server list
    const servers = options.urls?.length ? options.urls : [options.url];
    servers.forEach(url => {
      this.serverHealth.set(url, {
        url,
        healthy: true, // Assume healthy until proven otherwise
        latency: Infinity,
        lastCheck: 0,
      });
    });
  }

  /**
   * Get list of available servers sorted by health/latency
   */
  private getAvailableServers(): string[] {
    return Array.from(this.serverHealth.entries())
      .filter(([_, health]) => health.healthy)
      .sort((a, b) => a[1].latency - b[1].latency)
      .map(([url]) => url);
  }

  /**
   * Connect to signaling server with automatic failover
   */
  async connect(): Promise<void> {
    const servers = this.getAvailableServers();
    
    if (servers.length === 0) {
      // Reset health and try all servers
      this.serverHealth.forEach((health) => {
        health.healthy = true;
        health.latency = Infinity;
      });
      servers.push(...Array.from(this.serverHealth.keys()));
    }

    for (const serverUrl of servers) {
      try {
        await this.connectToServer(serverUrl);
        this.startHealthChecks();
        return;
      } catch (error) {
        console.warn(`⚠️ [SIGNALING] Failed to connect to ${serverUrl}, trying next...`);
        this.markServerUnhealthy(serverUrl);
      }
    }

    // Don't throw - just log warning and continue without signaling
    // P2P will work in degraded mode (no peer discovery, but existing connections work)
    console.warn('⚠️ [SIGNALING] No signaling servers available - P2P will work in degraded mode');
  }

  /**
   * Connect to a specific server
   */
  private connectToServer(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      debugLogger.websocket('[SIGNALING]...', serverUrl);

      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${serverUrl}`));
      }, this.options.connectionTimeout);

      this.socket = io(serverUrl, {
        path: '/signaling',
        auth: {
          userId: this.options.userId,
          token: this.options.authToken,
        },
        transports: ['websocket'],
        timeout: this.options.connectionTimeout,
      });

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        debugLogger.info(`✅ [SIGNALING] Connected to ${serverUrl} (${latency}ms)`);
        
        this.connected = true;
        this.currentServerUrl = serverUrl;
        this.reconnectAttempts = 0;
        
        // Update server health
        const health = this.serverHealth.get(serverUrl);
        if (health) {
          health.healthy = true;
          health.latency = latency;
          health.lastCheck = Date.now();
        }
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('❌ [SIGNALING] Connection error', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        debugLogger.websocket('[SIGNALING]...', reason);
        this.connected = false;
        
        // Auto-reconnect on unexpected disconnect
        if (reason === 'transport close' || reason === 'transport error') {
          this.handleDisconnect();
        }
      });

      // Peer presence events
      this.socket.on('peer-available', (data: { peerId: string }) => {
        debugLogger.debug('👤 [SIGNALING] Peer available', data.peerId);
        this.options.onPeerAvailable?.(data.peerId);
      });

      this.socket.on('peer-unavailable', (data: { peerId: string }) => {
        debugLogger.debug('👤 [SIGNALING] Peer unavailable', data.peerId);
        this.options.onPeerUnavailable?.(data.peerId);
      });

      // Health check pong
      this.socket.on('pong', () => {
        const health = this.serverHealth.get(this.currentServerUrl);
        if (health) {
          health.lastCheck = Date.now();
        }
      });
    });
  }

  /**
   * Handle unexpected disconnect - try to reconnect
   */
  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      debugLogger.debug('⚠️ [SIGNALING] Max reconnect attempts reached, switching server');
      this.markServerUnhealthy(this.currentServerUrl);
      this.reconnectAttempts = 0;
      
      try {
        const oldUrl = this.currentServerUrl;
        await this.connect();
        this.options.onServerSwitch?.(oldUrl, this.currentServerUrl);
      } catch (error) {
        console.error('❌ [SIGNALING] Failed to switch to backup server');
      }
      return;
    }

    this.reconnectAttempts++;
    debugLogger.debug(`🔄 [SIGNALING] Reconnecting... (attempt ${this.reconnectAttempts});`);
    
    setTimeout(async () => {
      try {
        await this.connectToServer(this.currentServerUrl);
      } catch {
        this.handleDisconnect();
      }
    }, 1000 * this.reconnectAttempts); // Exponential backoff
  }

  /**
   * Mark a server as unhealthy
   */
  private markServerUnhealthy(url: string): void {
    const health = this.serverHealth.get(url);
    if (health) {
      health.healthy = false;
      health.lastCheck = Date.now();
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.stopHealthChecks();
    
    this.healthCheckTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Check health of all known servers
   */
  async checkAllServersHealth(): Promise<SignalingServerHealth[]> {
    const results: SignalingServerHealth[] = [];
    
    for (const [url, health] of this.serverHealth.entries()) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        
        if (response.ok) {
          health.healthy = true;
          health.latency = Date.now() - startTime;
        } else {
          health.healthy = false;
        }
      } catch {
        health.healthy = false;
      }
      
      health.lastCheck = Date.now();
      results.push({ ...health });
    }
    
    return results;
  }

  /**
   * Get current server health status
   */
  getServerHealth(): SignalingServerHealth[] {
    return Array.from(this.serverHealth.values());
  }

  /**
   * Get currently connected server URL
   */
  getCurrentServer(): string {
    return this.currentServerUrl;
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    debugLogger.websocket('[SIGNALING]...');
    this.stopHealthChecks();
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.currentServerUrl = '';
  }

  /**
   * Get socket instance for WebRTC signaling
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Request connection to peer
   */
  requestConnection(peerId: string): void {
    debugLogger.debug('📡 [SIGNALING] Requesting connection to peer', peerId);
    this.socket?.emit('request-connection', { peerId });
  }

  /**
   * Notify peer availability
   */
  notifyAvailable(): void {
    debugLogger.debug('📡 [SIGNALING] Notifying availability');
    this.socket?.emit('peer-available');
  }

  /**
   * Notify peer unavailability
   */
  notifyUnavailable(): void {
    debugLogger.debug('📡 [SIGNALING] Notifying unavailability');
    this.socket?.emit('peer-unavailable');
  }
}
