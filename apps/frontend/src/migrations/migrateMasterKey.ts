/**
 * Migration Script: localStorage masterKey → IndexedDB Secure Storage
 * 
 * SECURITY FIX: Migrates plaintext masterKey from localStorage to IndexedDB
 * with non-extractable CryptoKey protection.
 * 
 * Run this migration automatically on app startup.
 */

import { storeMasterKey, importRawKey } from '../lib/keyStore';

import { debugLogger } from "../lib/debugLogger";
export interface MigrationResult {
  status: 'success' | 'not_needed' | 'failed';
  message: string;
  timestamp: number;
}

/**
 * Migrates masterKey from localStorage to secure IndexedDB storage
 * 
 * @returns Migration result with status and message
 */
export async function migrateMasterKeyToSecureStorage(): Promise<MigrationResult> {
  const timestamp = Date.now();
  
  try {
    // Check if migration is needed
    const oldMasterKeyHex = localStorage.getItem('masterKey');
    
    if (!oldMasterKeyHex) {
      // No old key found - check in Zustand persist store
      const authStorage = localStorage.getItem('cipher-pulse-auth');
      
      if (!authStorage) {
        return {
          status: 'not_needed',
          message: 'No masterKey found in localStorage - migration not needed',
          timestamp,
        };
      }
      
      try {
        const parsed = JSON.parse(authStorage);
        const masterKeyFromSession = parsed?.state?.session?.masterKey;
        
        if (!masterKeyFromSession) {
          return {
            status: 'not_needed',
            message: 'No masterKey in session storage - migration not needed',
            timestamp,
          };
        }
        
        // Migrate from Zustand persist
        await migrateMasterKey(masterKeyFromSession);
        
        // Remove masterKey from Zustand persist (keep other session data)
        if (parsed.state?.session) {
          delete parsed.state.session.masterKey;
          localStorage.setItem('cipher-pulse-auth', JSON.stringify(parsed));
        }
        
        console.info('[Migration] ✅ Migrated masterKey from Zustand persist to IndexedDB');
        
        return {
          status: 'success',
          message: 'Successfully migrated masterKey from Zustand persist to secure IndexedDB',
          timestamp,
        };
        
      } catch (parseError) {
        console.warn('[Migration] Failed to parse auth storage:', parseError);
        return {
          status: 'not_needed',
          message: 'Could not parse auth storage - migration not needed',
          timestamp,
        };
      }
    }
    
    // Migrate from direct localStorage
    await migrateMasterKey(oldMasterKeyHex);
    
    // Remove old key from localStorage
    localStorage.removeItem('masterKey');
    console.info('[Migration] ✅ Migrated masterKey from localStorage to IndexedDB');
    
    return {
      status: 'success',
      message: 'Successfully migrated masterKey from localStorage to secure IndexedDB',
      timestamp,
    };
    
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    
    return {
      status: 'failed',
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp,
    };
  }
}

/**
 * Helper: Migrates a masterKey hex string to IndexedDB
 */
async function migrateMasterKey(masterKeyHex: string): Promise<void> {
  // Convert hex string to Uint8Array
  const keyBytes = hexToBytes(masterKeyHex);
  
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid masterKey length: expected 32 bytes, got ${keyBytes.length}`);
  }
  
  // Import as non-extractable CryptoKey
  const cryptoKey = await importRawKey(keyBytes);
  
  // Store in IndexedDB
  const success = await storeMasterKey(cryptoKey);
  
  if (!success) {
    throw new Error('Failed to store masterKey in IndexedDB');
  }
  
  // Secure wipe of sensitive data from memory
  keyBytes.fill(0);
}

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove any whitespace or separators
  const cleanHex = hex.replace(/[\s:-]/g, '');
  
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  
  return bytes;
}

/**
 * Check if migration has been completed
 */
export function isMigrationCompleted(): boolean {
  const oldMasterKey = localStorage.getItem('masterKey');
  
  if (oldMasterKey) {
    return false; // Old key still exists
  }
  
  // Check Zustand persist
  try {
    const authStorage = localStorage.getItem('cipher-pulse-auth');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      if (parsed?.state?.session?.masterKey) {
        return false; // masterKey still in session
      }
    }
  } catch {
    // Ignore parse errors
  }
  
  return true; // No old keys found
}

/**
 * Log migration status for debugging
 */
export async function logMigrationStatus(): Promise<void> {
  const completed = isMigrationCompleted();
  debugLogger.debug(`[Migration] Status: ${completed ? '✅ Completed' : '⚠️ Pending'}`);
  
  if (!completed) {
    console.warn('[Migration] ⚠️ Plaintext masterKey detected in localStorage - migration recommended');
  }
}