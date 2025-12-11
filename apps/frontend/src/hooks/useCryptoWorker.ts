/**
 * Crypto Worker Hook - Project Chimera
 * 
 * Hook pour déporter les opérations crypto dans un Web Worker
 * Note: Implementation complète nécessite configuration Vite pour workers
 * 
 * Pour l'instant, cette implémentation est un stub qui utilise le main thread
 * L'implémentation complète sera faite dans une future itération
 */

import { useCallback } from 'react';
import { encryptSealed, decryptSealed } from '../lib/crypto';

/**
 * Hook pour crypto operations (actuellement sur main thread)
 * TODO: Implémenter véritable Web Worker avec Vite worker plugin
 */
export function useCryptoWorker() {
  const encrypt = useCallback(async (
    plaintext: string,
    key: Uint8Array
  ): Promise<string> => {
    // TODO: Déporter dans Web Worker
    // Pour l'instant, utilise le main thread
    return encryptSealed(plaintext, key);
  }, []);

  const decrypt = useCallback(async (
    ciphertext: string,
    publicKey: Uint8Array,
    secretKey: Uint8Array
  ): Promise<string> => {
    // TODO: Déporter dans Web Worker
    // Pour l'instant, utilise le main thread
    return decryptSealed(ciphertext, publicKey, secretKey);
  }, []);

  return { encrypt, decrypt };
}

/**
 * Note d'implémentation Web Worker:
 * 
 * Pour implémenter un vrai Web Worker:
 * 
 * 1. Créer src/workers/crypto.worker.ts:
 * ```typescript
 * import { encryptSealed, decryptSealed } from '../lib/crypto';
 * 
 * self.addEventListener('message', async (e) => {
 *   const { type, payload, id } = e.data;
 *   try {
 *     let result;
 *     switch (type) {
 *       case 'encrypt':
 *         result = await encryptSealed(payload.plaintext, payload.key, payload.context);
 *         break;
 *       case 'decrypt':
 *         result = await decryptSealed(payload.ciphertext, payload.key, payload.context);
 *         break;
 *     }
 *     self.postMessage({ id, result });
 *   } catch (error) {
 *     self.postMessage({ id, error: error.message });
 *   }
 * });
 * ```
 * 
 * 2. Configurer Vite (vite.config.ts):
 * ```typescript
 * export default defineConfig({
 *   worker: {
 *     format: 'es',
 *   },
 * });
 * ```
 * 
 * 3. Utiliser dans le hook:
 * ```typescript
 * const workerRef = useRef<Worker>();
 * 
 * useEffect(() => {
 *   workerRef.current = new Worker(
 *     new URL('../workers/crypto.worker.ts', import.meta.url),
 *     { type: 'module' }
 *   );
 *   return () => workerRef.current?.terminate();
 * }, []);
 * ```
 * 
 * Bénéfices attendus:
 * - Main thread débloqué pendant crypto operations
 * - Interaction to Next Paint (INP) réduit de ~50%
 * - Pas de lag pendant la frappe
 * - Meilleure perception de performance
 */
