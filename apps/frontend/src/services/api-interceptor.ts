/**
 * API Interceptor with Automatic Token Refresh
 * 
 * ARCHITECTURE: Gère automatiquement le rafraîchissement des tokens expirés
 * 
 * Features:
 * - Intercepte les erreurs 401 Unauthorized
 * - Rafraîchit automatiquement le token
 * - Rejoue la requête initiale
 * - Gère la concurrence (une seule requête de refresh à la fois)
 * - Déconnecte l'utilisateur si le refresh échoue
 */

import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/auth';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Queue pour stocker les requêtes en attente pendant le refresh
 */
const pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Notifie toutes les requêtes en attente avec le nouveau token
 */
function notifyPendingRequests(token: string | null, error: Error | null = null) {
  pendingRequests.forEach((request) => {
    if (error) {
      request.reject(error);
    } else if (token) {
      request.resolve(token);
    }
  });
  pendingRequests.length = 0;
}

// ============================================================================
// TOKEN REFRESH LOGIC
// ============================================================================

/**
 * Rafraîchit le token d'accès
 * 
 * @returns Nouveau access token
 * @throws Error si le refresh échoue
 */
async function refreshAccessToken(): Promise<string> {
  const { session, setSession, clearSession } = useAuthStore.getState();

  if (!session?.refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: session.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();

    // Mettre à jour la session avec le nouveau token
    setSession({
      ...session,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || session.refreshToken,
    });

    return data.accessToken;
  } catch (error) {
    // Si le refresh échoue, déconnecter l'utilisateur
    clearSession();

    // Rediriger vers la page de login
    window.location.href = '/login';

    throw error;
  }
}

/**
 * Obtient un token valide (rafraîchit si nécessaire)
 * 
 * @returns Token valide
 */
export async function getValidToken(): Promise<string> {
  const { session } = useAuthStore.getState();

  if (!session?.accessToken) {
    throw new Error('No access token available');
  }

  // Si un refresh est déjà en cours, attendre
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  return session.accessToken;
}

/**
 * Gère le rafraîchissement du token avec gestion de la concurrence
 * 
 * @returns Nouveau token
 */
async function handleTokenRefresh(): Promise<string> {
  // Si un refresh est déjà en cours, attendre
  if (isRefreshing && refreshPromise) {
    return new Promise((resolve, reject) => {
      pendingRequests.push({ resolve, reject });
    });
  }

  // Marquer qu'un refresh est en cours
  isRefreshing = true;

  refreshPromise = refreshAccessToken()
    .then((newToken) => {
      isRefreshing = false;
      refreshPromise = null;

      // Notifier toutes les requêtes en attente
      notifyPendingRequests(newToken);

      return newToken;
    })
    .catch((error) => {
      isRefreshing = false;
      refreshPromise = null;

      // Notifier toutes les requêtes en attente de l'erreur
      notifyPendingRequests(null, error);

      throw error;
    });

  return refreshPromise;
}

// ============================================================================
// FETCH WITH AUTO-REFRESH
// ============================================================================

/**
 * Fetch avec rafraîchissement automatique du token
 * 
 * @param url - URL de la requête
 * @param options - Options fetch
 * @param retryCount - Nombre de tentatives (interne)
 * @returns Response
 */
export async function fetchWithRefresh(
  url: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> {
  const { session } = useAuthStore.getState();

  // Ajouter le token d'authentification si disponible
  const headers = new Headers(options.headers);
  if (session?.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Si 401 et pas encore de retry, tenter de rafraîchir le token
  if (response.status === 401 && retryCount === 0) {
    try {
      // Rafraîchir le token
      const newToken = await handleTokenRefresh();

      // Rejouer la requête avec le nouveau token
      const newHeaders = new Headers(options.headers);
      newHeaders.set('Authorization', `Bearer ${newToken}`);

      return fetchWithRefresh(
        url,
        {
          ...options,
          headers: newHeaders,
        },
        retryCount + 1
      );
    } catch (error) {
      // Si le refresh échoue, retourner la réponse 401 originale
      return response;
    }
  }

  return response;
}

/**
 * Wrapper pour fetchV2 avec auto-refresh
 * 
 * @param path - Chemin de l'API (ex: /conversations)
 * @param options - Options fetch
 * @returns Données JSON
 */
export async function fetchV2WithRefresh<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/api/v2${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `Request failed: ${response.status}`;
    const error = new Error(errorMessage) as Error & { details?: string[] };
    if (errorData.details) {
      error.details = errorData.details;
    }
    throw error;
  }

  return response.json() as Promise<T>;
}

/**
 * Wrapper pour les requêtes authentifiées avec auto-refresh
 * 
 * @param path - Chemin de l'API
 * @param options - Options fetch
 * @returns Données JSON
 */
export async function authFetchV2WithRefresh<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { session } = useAuthStore.getState();

  // Ne pas frapper l'API protégée sans access token :
  // cela évite les 401 "No Authorization was found in request.headers" et clarifie l'état côté frontend.
  if (!session?.accessToken) {
    throw new Error('No access token in session (user is not authenticated)');
  }

  return fetchV2WithRefresh<T>(path, options);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Vérifie si un token est expiré (sans faire de requête)
 * 
 * @param token - JWT token
 * @returns true si expiré
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Convertir en millisecondes
    return Date.now() >= exp;
  } catch {
    return true;
  }
}

/**
 * Obtient le temps restant avant expiration du token
 * 
 * @param token - JWT token
 * @returns Millisecondes avant expiration
 */
export function getTokenTimeRemaining(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000;
    return Math.max(0, exp - Date.now());
  } catch {
    return 0;
  }
}

/**
 * Rafraîchit le token de manière proactive avant expiration
 * 
 * @param token - Token actuel
 * @param thresholdMs - Seuil en ms avant expiration pour rafraîchir (défaut: 5 min)
 */
export async function proactiveTokenRefresh(
  token: string,
  thresholdMs: number = 5 * 60 * 1000
): Promise<void> {
  const timeRemaining = getTokenTimeRemaining(token);

  if (timeRemaining < thresholdMs) {
    await handleTokenRefresh();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Récupère les clés de récupération CHIFFREES depuis le backend
 * SECURITY: Le backend retourne les données chiffrées - le client doit les déchiffrer localement
 * MasterKey n'est JAMAIS envoyée au serveur
 */
export async function getRecoveryKeys(): Promise<{
  success: boolean;
  securityTier: string;
  encryptedMnemonic: string; // Encrypted - must decrypt locally with masterKey
  encryptedChecksums: string | null; // Encrypted - must decrypt locally (DiceKey only)
  username: string;
  userId: string;
  createdAt: string;
  _security: string;
}> {
  return authFetchV2WithRefresh('/auth/recovery-keys', {
    method: 'GET',
  });
}
