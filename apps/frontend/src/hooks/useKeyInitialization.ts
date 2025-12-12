/**
 * useKeyInitialization Hook
 * 
 * Automatically initializes e2ee-v2 keys for users on first login
 * - Checks if user has keys
 * - Generates keys if missing
 * - Uploads public keys to server
 * - Handles errors gracefully
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import {
  hasUserKeys,
  loadUserKeys,
  generateUserKeys,
  storeUserKeys,
  getPublicKeys as getLocalPublicKeys,
} from '../lib/e2ee/keyManager';
import { uploadPublicKeys } from '../services/api-v2';
import _sodium from 'libsodium-wrappers';

interface KeyInitializationState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  keysExist: boolean;
}

export function useKeyInitialization() {
  const session = useAuthStore((state) => state.session);
  const [state, setState] = useState<KeyInitializationState>({
    initialized: false,
    loading: true,
    error: null,
    keysExist: false,
  });

  useEffect(() => {
    let mounted = true;

    async function initializeKeys() {
      if (!session?.user) {
        // User not logged in
        setState({
          initialized: false,
          loading: false,
          error: null,
          keysExist: false,
        });
        return;
      }

      const userId = session.user.id;
      const username = session.user.username;

      try {
        await _sodium.ready;

        // Check if user already has keys locally
        const keysExist = hasUserKeys(userId);

        if (keysExist) {
          console.log('✅ [KeyInit] User keys already exist');
          
          // Verify keys are valid
          const keys = await loadUserKeys(userId);
          if (!keys) {
            throw new Error('Keys exist but failed to load');
          }

          if (mounted) {
            setState({
              initialized: true,
              loading: false,
              error: null,
              keysExist: true,
            });
          }
          return;
        }

        // No keys found - generate new ones
        console.log('🔑 [KeyInit] Generating new keys for user...');

        const keys = await generateUserKeys(userId, username);
        
        // Store keys locally
        await storeUserKeys(keys);
        console.log('✅ [KeyInit] Keys stored locally');

        // Upload public keys to server
        const publicKeyB64 = _sodium.to_base64(keys.publicKey);
        const signPublicKeyB64 = _sodium.to_base64(keys.signPublicKey);

        try {
          await uploadPublicKeys(publicKeyB64, signPublicKeyB64);
          console.log('✅ [KeyInit] Public keys uploaded to server');
        } catch (uploadError) {
          console.warn('⚠️ [KeyInit] Failed to upload public keys:', uploadError);
          // Non-fatal: keys are stored locally, can retry upload later
        }

        if (mounted) {
          setState({
            initialized: true,
            loading: false,
            error: null,
            keysExist: true,
          });
        }

        console.log('🎉 [KeyInit] Key initialization complete');
      } catch (error) {
        console.error('❌ [KeyInit] Key initialization failed:', error);
        
        if (mounted) {
          setState({
            initialized: false,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            keysExist: false,
          });
        }
      }
    }

    initializeKeys();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id, session?.user?.username]);

  return state;
}

/**
 * Hook to manually trigger key initialization
 * Useful for retry after error
 */
export function useManualKeyInitialization() {
  const session = useAuthStore((state) => state.session);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeKeys = async () => {
    if (!session?.user) {
      setError('No user session');
      return false;
    }

    const userId = session.user.id;
    const username = session.user.username;

    setLoading(true);
    setError(null);

    try {
      await _sodium.ready;

      // Check if keys already exist
      if (hasUserKeys(userId)) {
        console.log('✅ Keys already exist');
        setLoading(false);
        return true;
      }

      // Generate keys
      const keys = await generateUserKeys(userId, username);
      await storeUserKeys(keys);

      // Upload to server
      const publicKeyB64 = _sodium.to_base64(keys.publicKey);
      const signPublicKeyB64 = _sodium.to_base64(keys.signPublicKey);
      await uploadPublicKeys(publicKeyB64, signPublicKeyB64);

      console.log('✅ [ManualKeyInit] Success');
      setLoading(false);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ [ManualKeyInit] Failed:', errorMsg);
      setError(errorMsg);
      setLoading(false);
      return false;
    }
  };

  return { initializeKeys, loading, error };
}

/**
 * Hook to get current user's keys
 * Returns null if not initialized
 */
export function useCurrentUserKeys() {
  const session = useAuthStore((state) => state.session);
  const [keys, setKeys] = useState<ReturnType<typeof getLocalPublicKeys> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadKeys() {
      if (!session?.user) {
        if (mounted) {
          setKeys(null);
          setLoading(false);
        }
        return;
      }

      try {
        const userId = session.user.id;
        const publicKeys = getLocalPublicKeys(userId);

        if (mounted) {
          setKeys(publicKeys);
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ Failed to load user keys:', error);
        if (mounted) {
          setKeys(null);
          setLoading(false);
        }
      }
    }

    loadKeys();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  return { keys, loading };
}
