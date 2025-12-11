export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:4000';

// P2P Signaling servers with failover support
export const SIGNALING_SERVERS = [
  import.meta.env.VITE_SIGNALING_PRIMARY || 'http://localhost:4000',
  import.meta.env.VITE_SIGNALING_SECONDARY || '',
  import.meta.env.VITE_SIGNALING_COMMUNITY || '',
].filter(Boolean);

// P2P Configuration
export const P2P_CONFIG = {
  enabled: import.meta.env.VITE_P2P_ENABLED !== 'false',
  fallbackToServerMs: 5000, // Fallback to WebSocket after 5s if P2P fails
  reconnectAttempts: 3,
  messageQueueMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// DHT Configuration for decentralized peer discovery
export const DHT_CONFIG = {
  // Enable DHT participation (opt-in for privacy)
  enabled: import.meta.env.VITE_DHT_ENABLED === 'true',
  // Bootstrap nodes for initial DHT entry
  bootstrapNodes: [
    import.meta.env.VITE_DHT_BOOTSTRAP_1 || '',
    import.meta.env.VITE_DHT_BOOTSTRAP_2 || '',
    import.meta.env.VITE_DHT_BOOTSTRAP_3 || '',
  ].filter(Boolean),
  // K-bucket size (max peers per routing table bucket)
  kBucketSize: 20,
  // Routing table refresh interval (ms)
  refreshInterval: 60000,
  // Query timeout (ms)
  queryTimeout: 10000,
};

// Federation Configuration (for server-to-server communication)
export const FEDERATION_CONFIG = {
  enabled: import.meta.env.VITE_FEDERATION_ENABLED === 'true',
  // Known federated servers
  federatedServers: [
    import.meta.env.VITE_FEDERATION_SERVER_1 || '',
    import.meta.env.VITE_FEDERATION_SERVER_2 || '',
  ].filter(Boolean),
};

// Local Network Discovery (mDNS/LAN)
export const LAN_CONFIG = {
  enabled: import.meta.env.VITE_LAN_DISCOVERY_ENABLED === 'true',
  serviceName: '_cipherpulse._tcp',
  broadcastInterval: 5000, // 5 seconds
};
