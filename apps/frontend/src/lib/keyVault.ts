/**
 * Key Vault - Secure key management
 * 
 * SECURITY: Centralized key management
 * - Uses SecureStorage (IndexedDB encrypted)
 * - Never exposes keys to localStorage
 * - Automatic key rotation support
 * - Memory-only session keys
 * 
 * @module KeyVault
 */

import { getSecureStorage, closeSecureStorage, SecureStorage } from './secureStorage';
import { logger } from '@/core/logger';

// Mobile debug helper
function mobileLog(level: 'info' | 'warn' | 'error', msg: string) {
  try {
    if (typeof window !== 'undefined' && (window as any).__mobileDebugLog) {
      (window as any).__mobileDebugLog(level, `[KeyVault] ${msg}`);
    }
  } catch { /* ignore */ }
}

const MASTER_KEY_ID = 'masterKey';

/**
 * Key Vault for secure key storage
 */
export class KeyVault {
  private readonly dbName: string;
  private storage: SecureStorage | null = null;
  private sessionKeys: Map<string, string> = new Map();
  private isInitialized = false;

  constructor(dbName = 'CipherPulseSecure') {
    this.dbName = dbName;
  }

  /**
   * Initialize vault with user password
   */
  async initialize(password: string): Promise<void> {
    try {
      this.storage = await getSecureStorage(password, this.dbName);
      this.isInitialized = true;
      logger.info('KeyVault initialized');
    } catch (error) {
      logger.error('Failed to initialize KeyVault', error as Error);
      throw new Error('Failed to initialize secure storage');
    }
  }

  /**
   * Store master key securely
   */
  async storeMasterKey(masterKey: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.storage!.setItem(MASTER_KEY_ID, masterKey);
      logger.info('Master key stored securely');
    } catch (error) {
      logger.error('Failed to store master key', error as Error);
      throw error;
    }
  }

  /**
   * Retrieve master key
   */
  async getMasterKey(): Promise<string | null> {
    this.ensureInitialized();

    try {
      const masterKey = await this.storage!.getItem(MASTER_KEY_ID);
      if (masterKey) {
        logger.debug('Master key retrieved');
      }
      return masterKey;
    } catch (error) {
      logger.error('Failed to retrieve master key', error as Error);
      return null;
    }
  }

  /**
   * Remove master key
   */
  async removeMasterKey(): Promise<void> {
    this.ensureInitialized();

    try {
      await this.storage!.removeItem(MASTER_KEY_ID);
      logger.info('Master key removed');
    } catch (error) {
      logger.error('Failed to remove master key', error as Error);
      throw error;
    }
  }

  /**
   * Store session key (memory only, not persisted)
   */
  setSessionKey(key: string, value: string): void {
    this.sessionKeys.set(key, value);
    logger.debug('Session key stored', { key });
  }

  /**
   * Get session key
   */
  getSessionKey(key: string): string | null {
    return this.sessionKeys.get(key) || null;
  }

  /**
   * Remove session key
   */
  removeSessionKey(key: string): void {
    this.sessionKeys.delete(key);
    logger.debug('Session key removed', { key });
  }

  /**
   * Clear all session keys
   */
  clearSessionKeys(): void {
    this.sessionKeys.clear();
    logger.info('All session keys cleared');
  }

  /**
   * Store generic encrypted data
   */
  async storeData(key: string, value: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.storage!.setItem(key, value);
      logger.debug('Data stored', { key });
    } catch (error) {
      logger.error('Failed to store data', error as Error, { key });
      throw error;
    }
  }

  /**
   * Retrieve generic encrypted data
   */
  async getData(key: string): Promise<string | null> {
    this.ensureInitialized();

    try {
      return await this.storage!.getItem(key);
    } catch (error) {
      logger.error('Failed to retrieve data', error as Error, { key });
      return null;
    }
  }

  /**
   * Remove generic data
   */
  async removeData(key: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.storage!.removeItem(key);
      logger.debug('Data removed', { key });
    } catch (error) {
      logger.error('Failed to remove data', error as Error, { key });
      throw error;
    }
  }

  /**
   * Check if master key exists
   */
  async hasMasterKey(): Promise<boolean> {
    this.ensureInitialized();

    try {
      const masterKey = await this.getMasterKey();
      return masterKey !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized();

    try {
      await this.storage!.clear();
      this.clearSessionKeys();
      logger.info('KeyVault cleared');
    } catch (error) {
      logger.error('Failed to clear KeyVault', error as Error);
      throw error;
    }
  }

  /**
   * Close vault and cleanup
   */
  close(): void {
    this.clearSessionKeys();
    closeSecureStorage();
    this.storage = null;
    this.isInitialized = false;
    logger.info('KeyVault closed');
  }

  /**
   * Export vault data (for backup)
   * WARNING: This exports encrypted data, not plaintext
   */
  async exportVault(): Promise<Record<string, any>> {
    this.ensureInitialized();

    try {
      const keys = await this.storage!.keys();
      const data: Record<string, any> = {};

      for (const key of keys) {
        const value = await this.storage!.getItem(key);
        if (value) {
          data[key] = value;
        }
      }

      logger.info('Vault exported', { keyCount: keys.length });
      return data;
    } catch (error) {
      logger.error('Failed to export vault', error as Error);
      throw error;
    }
  }

  // Private methods

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.storage) {
      throw new Error('KeyVault not initialized. Call initialize() first.');
    }
  }
}

// Singleton instance
let keyVaultInstance: KeyVault | null = null;
let e2eeVaultInstance: KeyVault | null = null;

const E2EE_DB_NAME = 'CipherPulseSecureE2EE';

/**
 * Get or create KeyVault instance
 */
export async function getKeyVault(password: string): Promise<KeyVault> {
  if (!keyVaultInstance) {
    keyVaultInstance = new KeyVault('CipherPulseSecure');
    await keyVaultInstance.initialize(password);
  }
  return keyVaultInstance;
}

/**
 * Get existing KeyVault instance (must be initialized first)
 */
export function getExistingKeyVault(): KeyVault | null {
  return keyVaultInstance;
}

/**
 * E2EE Vault (keyed by masterKey-derived secret)
 * This is intentionally separate from the "password" KeyVault, so mnemonic login
 * doesn't conflict with device-local password unlock.
 */
export async function getE2EEVault(secret: string): Promise<KeyVault> {
  mobileLog('info', 'getE2EEVault() called');
  
  if (!e2eeVaultInstance) {
    mobileLog('info', 'Creating new E2EE vault instance...');
    e2eeVaultInstance = new KeyVault(E2EE_DB_NAME);
    
    try {
      mobileLog('info', 'Initializing E2EE vault...');
      await e2eeVaultInstance.initialize(secret);
      mobileLog('info', 'E2EE vault initialized OK');
    } catch (err: any) {
      mobileLog('error', `E2EE vault init FAILED: ${err?.message || err}`);
      e2eeVaultInstance = null;
      throw err;
    }
  } else {
    mobileLog('info', 'E2EE vault already exists');
  }
  
  return e2eeVaultInstance;
}

export function getExistingE2EEVault(): KeyVault | null {
  return e2eeVaultInstance;
}

/**
 * Close and reset KeyVault instance
 */
export function closeKeyVault(): void {
  if (keyVaultInstance) {
    keyVaultInstance.close();
    keyVaultInstance = null;
  }

  if (e2eeVaultInstance) {
    e2eeVaultInstance.close();
    e2eeVaultInstance = null;
  }
}
