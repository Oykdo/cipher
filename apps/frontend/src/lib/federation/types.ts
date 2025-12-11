/**
 * Federation Protocol Types
 * 
 * Inspired by Matrix/ActivityPub federation models
 * Each server maintains its users but can route to other servers
 */

export interface FederatedServer {
  id: string;
  domain: string;
  publicKey: string;
  endpoints: {
    federation: string;
    userLookup: string;
    messageRelay: string;
  };
  status: 'active' | 'degraded' | 'offline';
  lastSeen: number;
  trustLevel: 'trusted' | 'verified' | 'unknown';
}

export interface FederatedUser {
  id: string;
  username: string;
  domain: string;
  publicKey?: string;
  homeServer: string;
}

export interface FederatedMessage {
  id: string;
  type: 'message' | 'presence' | 'key_exchange' | 'server_announce';
  from: {
    userId: string;
    domain: string;
  };
  to: {
    userId: string;
    domain: string;
  };
  payload: unknown;
  timestamp: number;
  signature: string;
}

export interface ServerAnnouncement {
  serverId: string;
  domain: string;
  publicKey: string;
  capabilities: string[];
  userCount?: number;
  version: string;
  timestamp: number;
  signature: string;
}

export interface FederationConfig {
  enabled: boolean;
  myDomain: string;
  myServerId: string;
  trustedDomains: string[];
  allowUnknownServers: boolean;
  messageRelayTimeout: number;
  serverDiscoveryInterval: number;
}

export const DEFAULT_FEDERATION_CONFIG: FederationConfig = {
  enabled: false,
  myDomain: '',
  myServerId: '',
  trustedDomains: [],
  allowUnknownServers: false,
  messageRelayTimeout: 30000,
  serverDiscoveryInterval: 300000, // 5 minutes
};

export type FederationEventType =
  | 'server:discovered'
  | 'server:connected'
  | 'server:disconnected'
  | 'message:received'
  | 'message:relayed'
  | 'user:found';

export interface FederationEvent {
  type: FederationEventType;
  data: unknown;
  timestamp: number;
}

export type FederationEventHandler = (event: FederationEvent) => void;
