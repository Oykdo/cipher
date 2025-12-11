/**
 * Secure Auth Store - Using KeyVault for sensitive data
 * 
 * SECURITY: Tokens and keys stored securely
 * - Tokens in cookies HttpOnly (backend managed)
 * - MasterKey in IndexedDB encrypted (KeyVault)
 * - User info only in localStorage
 * - Session keys in memory only
 * 
 * @module AuthSecure
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getKeyVault, closeKeyVault, KeyVault } from '@/lib/keyVault';
import { initializeStorageSecurity } from '@/lib/storageMigration';
import { logger } from '@/core/logger';
import { initializeE2EE, shutdownE2EE } from '@/lib/e2ee/e2eeService';

export type SecurityTier = 'standard' | 'dice-key';

interface User {
  id: string;
  username: string;
  securityTier: SecurityTier;
  createdAt?: number;
}

interface AuthSession {
  user: User;
  // Tokens are now in HttpOnly cookies, not stored here
  // masterKey is in KeyVault, not stored here
}

interface AuthState {
  session: AuthSession | null;
  isInitialized: boolean;
  keyVault: KeyVault | null;
  
  // Actions
  initialize: (password: string) => Promise<void>;
  setSession: (session: AuthSession, masterKey?: string) => Promise<void>;
  clearSession: () => Promise<void>;
  getMasterKey: () => Promise<string | null>;
  setMasterKey: (masterKey: string) => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      isInitialized: false,
      keyVault: null,

      /**
       * Initialize secure storage
       */
      initialize: async (password: string) => {
        try {
          logger.info('Initializing secure auth store...');

          // Initialize KeyVault
          const vault = await getKeyVault(password);
          set({ keyVault: vault, isInitialized: true });

          // Run storage security migration
          await initializeStorageSecurity(vault);

          logger.info('Secure auth store initialized');
        } catch (error) {
          logger.error('Failed to initialize secure auth store', error as Error);
          throw error;
        }
      },

      /**
       * Set session with optional masterKey
       */
      setSession: async (session: AuthSession, masterKey?: string) => {
        const { keyVault, isInitialized } = get();

        if (!isInitialized || !keyVault) {
          logger.warn('KeyVault not initialized, storing session without masterKey');
          set({ session });
          return;
        }

        try {
          // Store masterKey in KeyVault if provided
          if (masterKey) {
            await keyVault.storeMasterKey(masterKey);
            logger.info('MasterKey stored securely');
          }

          // Store only user info in localStorage (via persist)
          set({ session });

          // Initialize E2EE for the user
          try {
            await initializeE2EE(session.user.username);
            logger.info('E2EE initialized for user', { username: session.user.username });
          } catch (e2eeError) {
            logger.error('Failed to initialize E2EE', e2eeError as Error);
            // Don't fail the login if E2EE initialization fails
          }

          logger.info('Session set', { userId: session.user.id });
        } catch (error) {
          logger.error('Failed to set session', error as Error);
          throw error;
        }
      },

      /**
       * Clear session and all secure data
       */
      clearSession: async () => {
        const { keyVault } = get();

        try {
          // Shutdown E2EE
          try {
            await shutdownE2EE();
            logger.info('E2EE shutdown complete');
          } catch (e2eeError) {
            logger.error('Failed to shutdown E2EE', e2eeError as Error);
          }

          // Clear KeyVault
          if (keyVault) {
            await keyVault.clearAll();
            closeKeyVault();
          }

          // Clear session
          set({ session: null, keyVault: null, isInitialized: false });

          logger.info('Session cleared');
        } catch (error) {
          logger.error('Failed to clear session', error as Error);
          throw error;
        }
      },

      /**
       * Get masterKey from KeyVault
       */
      getMasterKey: async () => {
        const { keyVault, isInitialized } = get();

        if (!isInitialized || !keyVault) {
          logger.warn('KeyVault not initialized');
          return null;
        }

        try {
          return await keyVault.getMasterKey();
        } catch (error) {
          logger.error('Failed to get masterKey', error as Error);
          return null;
        }
      },

      /**
       * Set masterKey in KeyVault
       */
      setMasterKey: async (masterKey: string) => {
        const { keyVault, isInitialized } = get();

        if (!isInitialized || !keyVault) {
          throw new Error('KeyVault not initialized');
        }

        try {
          await keyVault.storeMasterKey(masterKey);
          logger.info('MasterKey updated');
        } catch (error) {
          logger.error('Failed to set masterKey', error as Error);
          throw error;
        }
      },

      /**
       * Check if user is authenticated
       */
      isAuthenticated: () => {
        const { session } = get();
        return session !== null;
      },
    }),
    {
      name: 'cipher-pulse-auth-secure',
      // Only persist user info, not sensitive data
      partialize: (state) => ({
        session: state.session,
        // Don't persist keyVault or isInitialized
      }),
    }
  )
);

/**
 * Hook to ensure auth is initialized
 */
export function useAuthInitialized(): boolean {
  return useAuthStore((state) => state.isInitialized);
}

/**
 * Hook to get current user
 */
export function useCurrentUser(): User | null {
  return useAuthStore((state) => state.session?.user || null);
}

/**
 * Hook to check authentication
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.isAuthenticated());
}
