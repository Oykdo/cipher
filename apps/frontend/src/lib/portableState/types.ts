/**
 * Portable State Types
 *
 * Defines the versioned payload structure for Self-Sovereign portable persistence.
 * Users can backup and restore their Resonance state across devices using their wallet.
 *
 * @module portableState/types
 */

/**
 * Current payload schema version.
 * Increment when making breaking changes to UserStatePayload structure.
 */
export const PAYLOAD_VERSION = 1;

/**
 * Vesting entry for Aether tokens that are locked until a specific time.
 */
export interface AetherVestingEntry {
  /** Amount of Aether tokens in this vesting entry */
  amount: number;
  /** Unix timestamp (ms since epoch) when tokens unlock */
  unlockAt: number;
}

/**
 * Aether token ledger state containing available, staked, and vesting balances.
 */
export interface AetherState {
  /** Available (liquid) Aether balance */
  available: number;
  /** Staked Aether balance (soulbound stake) */
  staked: number;
  /** Vesting entries with unlock schedules */
  vesting: AetherVestingEntry[];
}

/**
 * Versioned payload for portable state backup.
 * Contains all user state that should persist across devices.
 *
 * This structure is serialized, encrypted, and stored on IPFS.
 * The CID is anchored on-chain for discoverability.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4
 */
export interface UserStatePayload {
  /**
   * Schema version for migration support.
   * Used to apply incremental migrations when loading older payloads.
   * @requirements 1.2
   */
  version: number;

  /**
   * User identifier (wallet address or internal userId).
   * Used to verify ownership during restoration.
   * @requirements 1.4
   */
  userId: string;

  /**
   * Timestamp when this payload was created (ms since epoch).
   * Used for conflict resolution when local state differs from backup.
   * @requirements 1.3
   */
  createdAt: number;

  /**
   * Resonance score [0, 1].
   * Core metric representing user's interaction quality.
   * @requirements 1.1
   */
  rho: number;

  /**
   * Last message timestamp for damping calculations (ms since epoch).
   * Null if user has never sent a message.
   */
  lastMessageAt: number | null;

  /**
   * Lockout timestamp if user is rate-limited (ms since epoch).
   * Null if user is not locked out.
   */
  lockedUntil: number | null;

  /**
   * Aether token state including available, staked, and vesting balances.
   * @requirements 1.1
   */
  aether: AetherState;

  /**
   * Peer trust scores (Web-of-Trust).
   * Maps peer IDs to their local reputation estimates [0, 1].
   * @requirements 1.1
   */
  peerRho: Record<string, number>;

  /**
   * Per-peer last seen timestamps for idempotent replay.
   * Maps peer IDs to the latest observed message timestamp (ms since epoch).
   */
  peerLastSeenAt: Record<string, number>;

  /**
   * SHA-256 checksum for integrity verification.
   * Computed over all other fields to detect tampering or corruption.
   */
  checksum: string;
}

/**
 * Encrypted blob structure stored on IPFS.
 * Contains the encrypted UserStatePayload with metadata for decryption.
 */
export interface EncryptedBlob {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded IV (12 bytes for AES-GCM) */
  iv: string;
  /** Encryption algorithm identifier */
  algorithm: 'AES-GCM-256';
  /** Payload version (unencrypted for migration routing) */
  version: number;
}

/**
 * Result of a successful backup operation.
 */
export interface BackupResult {
  /** IPFS Content Identifier for the encrypted blob */
  cid: string;
  /** Timestamp when backup was created (ms since epoch) */
  timestamp: number;
  /** Size of the encrypted blob in bytes */
  size: number;
}

/**
 * Result of a successful restore operation.
 */
export interface RestoreResult {
  /** Decrypted and validated payload */
  payload: UserStatePayload;
  /** IPFS CID from which the payload was restored */
  cid: string;
  /** Timestamp when restoration completed (ms since epoch) */
  restoredAt: number;
}

/**
 * Configuration for IPFS gateway and pinning service.
 */
export interface IPFSConfig {
  /** IPFS gateway URL */
  gateway: string;
  /** API key for authenticated requests (optional) */
  apiKey?: string;
  /** Pinning service provider */
  pinningService: 'pinata' | 'web3storage' | 'infura';
}

/**
 * Configuration for blockchain interaction.
 */
export interface ChainConfig {
  /** RPC URL for the blockchain network */
  rpcUrl: string;
  /** Address of the CID registry contract */
  contractAddress: string;
  /** Chain ID for network identification */
  chainId: number;
}

/**
 * Wallet provider interface for signing and transactions.
 */
export interface WalletProvider {
  /** Connected wallet address */
  address: string;
  /** Sign a message with the wallet's private key */
  signMessage(message: string): Promise<string>;
  /** Send a transaction to the blockchain */
  sendTransaction(tx: TransactionRequest): Promise<string>;
  /** Check if wallet is connected */
  isConnected(): boolean;
}

/**
 * Transaction request for blockchain operations.
 */
export interface TransactionRequest {
  /** Target contract address */
  to: string;
  /** Encoded function call data */
  data: string;
  /** Optional gas limit */
  gasLimit?: bigint;
  /** Optional value to send (in wei) */
  value?: bigint;
}

/**
 * Backup event types that can trigger automatic backups.
 */
export type BackupEventType = 'stake' | 'mint' | 'manual';

/**
 * Backup trigger event with metadata.
 */
export interface BackupEvent {
  /** Type of event that triggered the backup */
  type: BackupEventType;
  /** Timestamp when the event occurred (ms since epoch) */
  timestamp: number;
  /** Amount involved in the event (for stake/mint) */
  amount?: number;
}
