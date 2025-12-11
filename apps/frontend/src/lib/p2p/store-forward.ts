/**
 * Store & Forward Module for P2P Offline Messaging
 * 
 * ARCHITECTURE:
 * - Queue messages locally in IndexedDB when peer is offline
 * - Automatic retry when peer comes back online
 * - Configurable expiration (default 7 days)
 * - Fallback to server relay after configurable delay
 * 
 * DECENTRALIZATION:
 * - Messages stay local until peer is available
 * - No server storage required for P2P messages
 * - Server relay only as last resort
 */

const DB_NAME = 'cipher-pulse-p2p';
const STORE_NAME = 'pending-messages';
const DB_VERSION = 1;

export interface QueuedMessage {
  id: string;
  peerId: string;
  conversationId: string;
  encryptedPayload: string;
  plaintext?: string; // For local display only, not stored
  createdAt: number;
  expiresAt: number;
  retryCount: number;
  lastRetryAt?: number;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'expired';
}

export interface StoreForwardConfig {
  maxRetries: number;
  retryIntervalMs: number;
  expirationMs: number;
  fallbackToServerAfterMs: number;
}

const DEFAULT_CONFIG: StoreForwardConfig = {
  maxRetries: 10,
  retryIntervalMs: 30000, // 30 seconds
  expirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  fallbackToServerAfterMs: 24 * 60 * 60 * 1000, // 24 hours
};

function isIDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('peerId', 'peerId', { unique: false });
        store.createIndex('conversationId', 'conversationId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
        console.info('[StoreForward] Created message queue store');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class StoreForwardQueue {
  private config: StoreForwardConfig;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private onSendCallback?: (message: QueuedMessage) => Promise<boolean>;
  private onFallbackCallback?: (message: QueuedMessage) => Promise<boolean>;
  private onMessageSentCallback?: (messageId: string) => void;

  constructor(config: Partial<StoreForwardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for sending messages via P2P
   */
  onSend(callback: (message: QueuedMessage) => Promise<boolean>): void {
    this.onSendCallback = callback;
  }

  /**
   * Set callback for fallback to server relay
   */
  onFallback(callback: (message: QueuedMessage) => Promise<boolean>): void {
    this.onFallbackCallback = callback;
  }

  /**
   * Set callback when message is successfully sent
   */
  onMessageSent(callback: (messageId: string) => void): void {
    this.onMessageSentCallback = callback;
  }

  /**
   * Queue a message for delivery when peer is online
   */
  async queueMessage(
    peerId: string,
    conversationId: string,
    encryptedPayload: string
  ): Promise<string> {
    if (!isIDBAvailable()) {
      throw new Error('IndexedDB not available');
    }

    const message: QueuedMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      peerId,
      conversationId,
      encryptedPayload,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.expirationMs,
      retryCount: 0,
      status: 'pending',
    };

    const db = await openDB();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      const store = tx.objectStore(STORE_NAME);
      store.add(message);
    });

    debugLogger.debug(`📦 [StoreForward] Queued message ${message.id} for peer ${peerId}`);
    return message.id;
  }

  /**
   * Get all pending messages for a peer
   */
  async getPendingForPeer(peerId: string): Promise<QueuedMessage[]> {
    if (!isIDBAvailable()) return [];

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('peerId');
      const request = index.getAll(peerId);

      request.onsuccess = () => {
        const messages = (request.result as QueuedMessage[])
          .filter(m => m.status === 'pending' || m.status === 'failed')
          .filter(m => m.expiresAt > Date.now());
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all pending messages
   */
  async getAllPending(): Promise<QueuedMessage[]> {
    if (!isIDBAvailable()) return [];

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        const messages = (request.result as QueuedMessage[])
          .filter(m => m.expiresAt > Date.now());
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update message status
   */
  async updateStatus(
    messageId: string,
    status: QueuedMessage['status'],
    incrementRetry = false
  ): Promise<void> {
    if (!isIDBAvailable()) return;

    const db = await openDB();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(messageId);

      request.onsuccess = () => {
        const message = request.result as QueuedMessage | undefined;
        if (message) {
          message.status = status;
          if (incrementRetry) {
            message.retryCount++;
            message.lastRetryAt = Date.now();
          }
          store.put(message);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Remove a message from queue
   */
  async removeMessage(messageId: string): Promise<void> {
    if (!isIDBAvailable()) return;

    const db = await openDB();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      const store = tx.objectStore(STORE_NAME);
      store.delete(messageId);
    });

    debugLogger.debug(`🗑️ [StoreForward] Removed message ${messageId}`);
  }

  /**
   * Process queued messages for a peer that just came online
   */
  async processPeerOnline(peerId: string): Promise<number> {
    const messages = await this.getPendingForPeer(peerId);
    let sentCount = 0;

    debugLogger.debug(`📤 [StoreForward] Processing ${messages.length} queued messages for peer ${peerId}`);

    for (const message of messages) {
      try {
        await this.updateStatus(message.id, 'sending');

        if (this.onSendCallback) {
          const success = await this.onSendCallback(message);

          if (success) {
            await this.updateStatus(message.id, 'sent');
            this.onMessageSentCallback?.(message.id);
            sentCount++;
            debugLogger.info('✅ [StoreForward] Sent queued message ${message.id}');
          } else {
            await this.updateStatus(message.id, 'failed', true);
          }
        }
      } catch (error) {
        console.error(`❌ [StoreForward] Failed to send message ${message.id}:`, error);
        await this.updateStatus(message.id, 'failed', true);
      }
    }

    return sentCount;
  }

  /**
   * Start automatic retry processing
   */
  startRetryProcessor(): void {
    if (this.retryTimer) return;

    this.retryTimer = setInterval(async () => {
      await this.processRetries();
      await this.cleanupExpired();
    }, this.config.retryIntervalMs);

    debugLogger.debug('🔄 [StoreForward] Started retry processor');
  }

  /**
   * Stop automatic retry processing
   */
  stopRetryProcessor(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      debugLogger.debug('⏹️ [StoreForward] Stopped retry processor');
    }
  }

  /**
   * Process messages that need retry or fallback
   */
  private async processRetries(): Promise<void> {
    const messages = await this.getAllPending();
    const now = Date.now();

    for (const message of messages) {
      // Check if should fallback to server
      const age = now - message.createdAt;
      if (age > this.config.fallbackToServerAfterMs && this.onFallbackCallback) {
        debugLogger.debug(`☁️ [StoreForward] Falling back to server for message ${message.id}`);

        try {
          const success = await this.onFallbackCallback(message);
          if (success) {
            await this.updateStatus(message.id, 'sent');
            this.onMessageSentCallback?.(message.id);
          } else {
            await this.updateStatus(message.id, 'failed', true);
          }
        } catch (error) {
          console.error(`❌ [StoreForward] Server fallback failed for ${message.id}:`, error);
        }
        continue;
      }

      // Check max retries
      if (message.retryCount >= this.config.maxRetries) {
        console.warn(`⚠️ [StoreForward] Max retries reached for message ${message.id}`);
        await this.updateStatus(message.id, 'failed');
        continue;
      }

      // Check retry interval
      if (message.lastRetryAt && (now - message.lastRetryAt) < this.config.retryIntervalMs) {
        continue;
      }
    }
  }

  /**
   * Clean up expired messages
   */
  private async cleanupExpired(): Promise<void> {
    if (!isIDBAvailable()) return;

    const db = await openDB();
    const now = Date.now();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          debugLogger.debug(`🗑️ [StoreForward] Cleaning up expired message ${cursor.value.id}`);
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    failed: number;
    sent: number;
    expired: number;
    totalSize: number;
  }> {
    if (!isIDBAvailable()) {
      return { pending: 0, failed: 0, sent: 0, expired: 0, totalSize: 0 };
    }

    const db = await openDB();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result as QueuedMessage[];
        const stats = {
          pending: 0,
          failed: 0,
          sent: 0,
          expired: 0,
          totalSize: 0,
        };

        for (const msg of messages) {
          stats.totalSize += msg.encryptedPayload.length;

          if (msg.expiresAt < now) {
            stats.expired++;
          } else if (msg.status === 'pending' || msg.status === 'sending') {
            stats.pending++;
          } else if (msg.status === 'failed') {
            stats.failed++;
          } else if (msg.status === 'sent') {
            stats.sent++;
          }
        }

        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all messages (for testing/reset)
   */
  async clearAll(): Promise<void> {
    if (!isIDBAvailable()) return;

    const db = await openDB();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      const store = tx.objectStore(STORE_NAME);
      store.clear();
    });

    debugLogger.debug('🗑️ [StoreForward] Cleared all messages');
  }
}

// Singleton instance
let instance: StoreForwardQueue | null = null;

export function getStoreForwardQueue(config?: Partial<StoreForwardConfig>): StoreForwardQueue {
  if (!instance) {
    instance = new StoreForwardQueue(config);
  }
  return instance;
}

export function resetStoreForwardQueue(): void {
  if (instance) {
    instance.stopRetryProcessor();
    instance = null;
  }
}
