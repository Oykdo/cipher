/**
 * Storage Migration - Clean up localStorage
 * 
 * SECURITY: Migrate sensitive data from localStorage to SecureStorage
 * - Remove all sensitive keys from localStorage
 * - Migrate to IndexedDB encrypted storage
 * - One-time migration on app startup
 * 
 * @module StorageMigration
 */

import { logger } from '@/core/logger';

// List of sensitive keys that should NEVER be in localStorage
const SENSITIVE_KEYS = [
  'masterKey',
  'privateKey',
  'secretKey',
  'password',
  'mnemonic',
  'seed',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'apiKey',
  'cipher-pulse-session',
];

// List of keys to preserve (non-sensitive)
const ALLOWED_KEYS = [
  'theme',
  'language',
  'lastUsername',
  'preferences',
];

/**
 * Clean all sensitive data from localStorage
 */
export function cleanSensitiveData(): void {
  try {
    let removedCount = 0;
    const keysToRemove: string[] = [];

    // Scan all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Check if key is sensitive
      const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      );

      // Check if key is explicitly allowed
      const isAllowed = ALLOWED_KEYS.includes(key);

      if (isSensitive && !isAllowed) {
        keysToRemove.push(key);
      }
    }

    // Remove sensitive keys
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      removedCount++;
    });

    if (removedCount > 0) {
      logger.warn('Sensitive data removed from localStorage', {
        count: removedCount,
        keys: keysToRemove,
      });
    } else {
      logger.info('No sensitive data found in localStorage');
    }
  } catch (error) {
    logger.error('Failed to clean sensitive data', error as Error);
  }
}

/**
 * Migrate data from localStorage to SecureStorage
 */
export async function migrateToSecureStorage(
  keyVault: any
): Promise<void> {
  try {
    const migratedKeys: string[] = [];

    // Check for masterKey in localStorage
    const oldMasterKey = localStorage.getItem('masterKey');
    if (oldMasterKey) {
      await keyVault.storeMasterKey(oldMasterKey);
      localStorage.removeItem('masterKey');
      migratedKeys.push('masterKey');
    }

    // Check for other sensitive data
    for (const sensitiveKey of SENSITIVE_KEYS) {
      const value = localStorage.getItem(sensitiveKey);
      if (value) {
        await keyVault.storeData(sensitiveKey, value);
        localStorage.removeItem(sensitiveKey);
        migratedKeys.push(sensitiveKey);
      }
    }

    if (migratedKeys.length > 0) {
      logger.info('Data migrated to SecureStorage', {
        count: migratedKeys.length,
        keys: migratedKeys,
      });
    }
  } catch (error) {
    logger.error('Failed to migrate data', error as Error);
    throw error;
  }
}

/**
 * Audit localStorage for sensitive data
 */
export function auditLocalStorage(): {
  hasSensitiveData: boolean;
  sensitiveKeys: string[];
  totalKeys: number;
} {
  const sensitiveKeys: string[] = [];
  const totalKeys = localStorage.length;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    );

    if (isSensitive) {
      sensitiveKeys.push(key);
    }
  }

  const result = {
    hasSensitiveData: sensitiveKeys.length > 0,
    sensitiveKeys,
    totalKeys,
  };

  if (result.hasSensitiveData) {
    logger.warn('Sensitive data detected in localStorage', result);
  }

  return result;
}

/**
 * Clear all localStorage (nuclear option)
 */
export function clearAllLocalStorage(): void {
  try {
    const keyCount = localStorage.length;
    localStorage.clear();
    logger.warn('All localStorage cleared', { keyCount });
  } catch (error) {
    logger.error('Failed to clear localStorage', error as Error);
  }
}

/**
 * Initialize storage security on app startup
 */
export async function initializeStorageSecurity(
  keyVault?: any
): Promise<void> {
  logger.info('Initializing storage security...');

  // Audit current state
  const audit = auditLocalStorage();

  if (audit.hasSensitiveData) {
    logger.warn('Found sensitive data in localStorage', {
      keys: audit.sensitiveKeys,
    });

    // If keyVault is provided, migrate data
    if (keyVault) {
      await migrateToSecureStorage(keyVault);
    } else {
      // Otherwise, just clean it
      cleanSensitiveData();
    }
  }

  logger.info('Storage security initialized', {
    totalKeys: audit.totalKeys,
    cleaned: audit.hasSensitiveData,
  });
}

/**
 * Schedule periodic audits
 */
export function scheduleStorageAudits(intervalMs: number = 60000): () => void {
  const intervalId = setInterval(() => {
    const audit = auditLocalStorage();
    if (audit.hasSensitiveData) {
      logger.error('SECURITY ALERT: Sensitive data detected in localStorage', undefined, {
        keys: audit.sensitiveKeys,
      });
      cleanSensitiveData();
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
