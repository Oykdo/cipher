/**
 * DHT Types for Decentralized Peer Discovery
 * 
 * Based on Kademlia DHT protocol concepts
 */

export interface PeerId {
  id: string;
  publicKey?: string;
}

export interface PeerInfo {
  id: string;
  addresses: string[];
  publicKey?: string;
  lastSeen: number;
  metadata?: Record<string, unknown>;
}

export interface DHTConfig {
  // Bootstrap nodes for initial peer discovery
  bootstrapNodes: string[];
  // How many peers to keep in routing table
  kBucketSize: number;
  // How often to refresh routing table (ms)
  refreshInterval: number;
  // Timeout for DHT queries (ms)
  queryTimeout: number;
  // Enable/disable DHT participation (privacy option)
  participateInDHT: boolean;
  // Local storage key prefix
  storagePrefix: string;
}

export const DEFAULT_DHT_CONFIG: DHTConfig = {
  bootstrapNodes: [],
  kBucketSize: 20,
  refreshInterval: 60000, // 1 minute
  queryTimeout: 10000, // 10 seconds
  participateInDHT: false, // Opt-in for privacy
  storagePrefix: 'cipher-pulse-dht',
};

export interface DHTRecord {
  key: string;
  value: Uint8Array;
  timestamp: number;
  ttl: number;
  signature?: string;
}

export interface RoutingTableEntry {
  peerId: string;
  distance: number;
  lastSeen: number;
  addresses: string[];
  failedAttempts: number;
}

export type DHTEventType = 
  | 'peer:discovered'
  | 'peer:connected'
  | 'peer:disconnected'
  | 'routing:updated'
  | 'dht:ready'
  | 'dht:error';

export interface DHTEvent {
  type: DHTEventType;
  peerId?: string;
  data?: unknown;
  timestamp: number;
}

export type DHTEventHandler = (event: DHTEvent) => void;
