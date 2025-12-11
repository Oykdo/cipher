/**
 * Key Rotation Manager
 * 
 * SECURITY: Automatic key rotation
 * - Rotate keys after N messages
 * - Rotate keys after N days
 * - Notify peers of rotation
 * - Migrate old messages
 * 
 * @module KeyRotationManager
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { logger } from '@/core/logger';

export interface KeyRotationPolicy {
  /**
   * Rotate after N messages
   */
  rotateAfterMessages: number;

  /**
   * Rotate after N days
   */
  rotateAfterDays: number;

  /**
   * Keep old keys for N days (for decrypting old messages)
   */
  keepOldKeysForDays: number;
}

export interface ConversationKeyInfo {
  conversationId: string;
  currentKey: Uint8Array;
  keyVersion: number;
  createdAt: number;
  messageCount: number;
  oldKeys: Array<{
    key: Uint8Array;
    version: number;
    createdAt: number;
    expiresAt: number;
  }>;
}

/**
 * Manages automatic key rotation for conversations
 */
export class KeyRotationManager {
  private keys: Map<string, ConversationKeyInfo> = new Map();
  private policy: KeyRotationPolicy;
  private rotationCallbacks: Set<
    (conversationId: string, newKey: Uint8Array, version: number) => void
  > = new Set();

  constructor(policy: Partial<KeyRotationPolicy> = {}) {
    this.policy = {
      rotateAfterMessages: policy.rotateAfterMessages ?? 10000,
      rotateAfterDays: policy.rotateAfterDays ?? 30,
      keepOldKeysForDays: policy.keepOldKeysForDays ?? 7,
    };

    logger.info('KeyRotationManager initialized', this.policy);

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get or create key for conversation
   */
  async getKey(
    conversationId: string,
    masterKey: string
  ): Promise<{ key: Uint8Array; version: number }> {
    let keyInfo = this.keys.get(conversationId);

    if (!keyInfo) {
      // Create new key
      keyInfo = await this.createKey(conversationId, masterKey);
      this.keys.set(conversationId, keyInfo);
    } else {
      // Check if rotation needed
      if (this.shouldRotate(keyInfo)) {
        await this.rotateKey(conversationId, masterKey);
        keyInfo = this.keys.get(conversationId)!;
      }
    }

    return {
      key: keyInfo.currentKey,
      version: keyInfo.keyVersion,
    };
  }

  /**
   * Get key by version (for decrypting old messages)
   */
  getKeyByVersion(
    conversationId: string,
    version: number
  ): Uint8Array | null {
    const keyInfo = this.keys.get(conversationId);
    if (!keyInfo) return null;

    // Check current key
    if (keyInfo.keyVersion === version) {
      return keyInfo.currentKey;
    }

    // Check old keys
    const oldKey = keyInfo.oldKeys.find((k) => k.version === version);
    return oldKey?.key || null;
  }

  /**
   * Increment message count (triggers rotation check)
   */
  incrementMessageCount(conversationId: string): void {
    const keyInfo = this.keys.get(conversationId);
    if (keyInfo) {
      keyInfo.messageCount++;
    }
  }

  /**
   * Register callback for key rotation events
   */
  onKeyRotation(
    callback: (conversationId: string, newKey: Uint8Array, version: number) => void
  ): void {
    this.rotationCallbacks.add(callback);
  }

  /**
   * Manually rotate key
   */
  async rotateKey(conversationId: string, masterKey: string): Promise<void> {
    const keyInfo = this.keys.get(conversationId);
    if (!keyInfo) {
      throw new Error('Conversation key not found');
    }

    logger.info('Rotating key', {
      conversationId,
      oldVersion: keyInfo.keyVersion,
      messageCount: keyInfo.messageCount,
    });

    // Move current key to old keys
    keyInfo.oldKeys.push({
      key: keyInfo.currentKey,
      version: keyInfo.keyVersion,
      createdAt: keyInfo.createdAt,
      expiresAt: Date.now() + this.policy.keepOldKeysForDays * 24 * 60 * 60 * 1000,
    });

    // Generate new key
    const newVersion = keyInfo.keyVersion + 1;
    const newKey = await this.deriveKey(conversationId, masterKey, newVersion);

    // Update key info
    keyInfo.currentKey = newKey;
    keyInfo.keyVersion = newVersion;
    keyInfo.createdAt = Date.now();
    keyInfo.messageCount = 0;

    // Notify callbacks
    this.rotationCallbacks.forEach((callback) => {
      try {
        callback(conversationId, newKey, newVersion);
      } catch (error) {
        logger.error('Key rotation callback error', error as Error);
      }
    });

    logger.info('Key rotated successfully', {
      conversationId,
      newVersion,
    });
  }

  /**
   * Export keys for persistence
   */
  exportKeys(): string {
    const data: any = {};

    this.keys.forEach((keyInfo, conversationId) => {
      data[conversationId] = {
        currentKey: this.bytesToBase64(keyInfo.currentKey),
        keyVersion: keyInfo.keyVersion,
        createdAt: keyInfo.createdAt,
        messageCount: keyInfo.messageCount,
        oldKeys: keyInfo.oldKeys.map((k) => ({
          key: this.bytesToBase64(k.key),
          version: k.version,
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
        })),
      };
    });

    return JSON.stringify(data);
  }

  /**
   * Import keys from persistence
   */
  importKeys(json: string): void {
    const data = JSON.parse(json);

    Object.entries(data).forEach(([conversationId, info]: [string, any]) => {
      this.keys.set(conversationId, {
        conversationId,
        currentKey: this.base64ToBytes(info.currentKey),
        keyVersion: info.keyVersion,
        createdAt: info.createdAt,
        messageCount: info.messageCount,
        oldKeys: info.oldKeys.map((k: any) => ({
          key: this.base64ToBytes(k.key),
          version: k.version,
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
        })),
      });
    });

    logger.info('Keys imported', { count: this.keys.size });
  }

  /**
   * Cleanup expired keys
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    this.keys.forEach((keyInfo) => {
      const before = keyInfo.oldKeys.length;
      keyInfo.oldKeys = keyInfo.oldKeys.filter((k) => k.expiresAt > now);
      cleaned += before - keyInfo.oldKeys.length;
    });

    if (cleaned > 0) {
      logger.info('Expired keys cleaned up', { count: cleaned });
    }
  }

  // Private methods

  /**
   * Create new key for conversation
   */
  private async createKey(
    conversationId: string,
    masterKey: string
  ): Promise<ConversationKeyInfo> {
    const key = await this.deriveKey(conversationId, masterKey, 1);

    return {
      conversationId,
      currentKey: key,
      keyVersion: 1,
      createdAt: Date.now(),
      messageCount: 0,
      oldKeys: [],
    };
  }

  /**
   * Derive key using HKDF
   */
  private async deriveKey(
    conversationId: string,
    masterKey: string,
    version: number
  ): Promise<Uint8Array> {
    const info = new TextEncoder().encode(
      `Pulse Conversation Key v${version}:${conversationId}`
    );
    const salt = new TextEncoder().encode(conversationId);
    const ikm = new TextEncoder().encode(masterKey);

    return hkdf(sha256, ikm, salt, info, 32);
  }

  /**
   * Check if key should be rotated
   */
  private shouldRotate(keyInfo: ConversationKeyInfo): boolean {
    // Check message count
    if (keyInfo.messageCount >= this.policy.rotateAfterMessages) {
      return true;
    }

    // Check age
    const ageMs = Date.now() - keyInfo.createdAt;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays >= this.policy.rotateAfterDays) {
      return true;
    }

    return false;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Cleanup every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Convert bytes to base64
   */
  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert base64 to bytes
   */
  private base64ToBytes(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}
