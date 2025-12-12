/**
 * API v2 - Clean Architecture Backend
 * 
 * Cette version utilise les nouveaux endpoints /api/v2/*
 * avec la nouvelle architecture en layers (Domain, Application, Infrastructure, Presentation)
 */

import { API_BASE_URL } from "../config";
import type { SecurityTier } from "../store/auth";
import { authFetchV2WithRefresh } from "./api-interceptor";

// ============================================================================
// TYPES & INTERFACES (correspondant aux DTOs backend)
// ============================================================================

export interface SignupRequestV2 {
  username: string;
  securityTier: SecurityTier;
  mnemonicLength?: 12 | 24; // Pour standard
  masterKeyHex?: string; // Pour dice-key
  mnemonic?: string[]; // Pour dice-key
}

export interface SignupResponseV2 {
  id: string;
  username: string;
  securityTier: SecurityTier;
  accessToken: string;
  refreshToken: string;
  mnemonic: string | string[]; // Peut être string ou array (backend retourne string)
}

export interface LoginRequestV2 {
  username: string;
  masterKey: string; // BIP-39 seed en hex
}

export interface LoginResponseV2 {
  user: {
    id: string;
    username: string;
    securityTier: SecurityTier;
    createdAt: number;
  };
  accessToken: string;
  refreshToken: string;
}

export interface CreateConversationRequestV2 {
  targetUsername: string;
}

export interface CreateConversationResponseV2 {
  id: string;
  createdAt: number;
  participants: Array<{
    id: string;
    username: string;
  }>;
}

export interface ConversationSummaryV2 {
  id: string;
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  otherParticipant: {
    id: string;
    username: string;
  };
}

export interface MessageV2 {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
  unlockBlockHeight?: number;
  isLocked?: boolean;
  isBurned?: boolean;
  burnedAt?: number;
  scheduledBurnAt?: number;
  burnDelay?: number; // Burn delay in seconds (for BAR messages not yet acknowledged)
  // P2P metadata (client-side only)
  isP2P?: boolean;
  isPending?: boolean;
  // Encryption metadata
  encryptionType?: 'nacl-box-v1' | 'double-ratchet-v1' | 'legacy' | string;
}

export interface SendMessageRequestV2 {
  conversationId: string;
  body: string;
  scheduledBurnAt?: number; // Timestamp pour burn after reading
  unlockBlockHeight?: number; // Pour time-lock
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchV2<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/v2${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.message || error.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// API v2 ENDPOINTS
// ============================================================================

export const apiv2 = {
  // ========================
  // AUTHENTICATION
  // ========================

  /**
   * Signup avec méthode Standard (BIP-39)
   */
  signupStandard: async (username: string, mnemonicLength: 12 | 24 = 12): Promise<SignupResponseV2> => {
    return fetchV2<SignupResponseV2>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        method: "standard",
        username,
        mnemonicLength,
      }),
    });
  },

  /**
   * Signup avec méthode DiceKey
   */
  signupDiceKey: async (username: string, masterKeyHex: string, mnemonic: string[]): Promise<SignupResponseV2> => {
    return fetchV2<SignupResponseV2>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        method: "dice-key",
        username,
        masterKeyHex,
        mnemonic,
      }),
    });
  },

  /**
   * Login avec username et masterKeyHash
   * @deprecated Use SRP login instead - masterKey should NEVER be sent to the server
   */
  login: async (_username: string, _masterKeyHash: string): Promise<LoginResponseV2> => {
    throw new Error('SECURITY: This method has been disabled. Use SRP login (/api/v2/auth/srp/login/*) instead. MasterKey must NEVER be sent to the server.');
  },

  /**
   * Refresh access token
   */
  refresh: async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
    return fetchV2("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },

  /**
   * Logout
   */
  logout: async (refreshToken: string): Promise<{ message: string }> => {
    return authFetchV2WithRefresh("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },

  // ========================
  // CONVERSATIONS
  // ========================

  /**
   * Lister les conversations de l'utilisateur
   */
  listConversations: async (): Promise<{ conversations: ConversationSummaryV2[] }> => {
    return authFetchV2WithRefresh("/conversations");
  },

  /**
   * Créer une nouvelle conversation
   */
  createConversation: async (targetUsername: string): Promise<CreateConversationResponseV2> => {
    return authFetchV2WithRefresh("/conversations", {
      method: "POST",
      body: JSON.stringify({ targetUsername }),
    });
  },

  /**
   * Récupérer une conversation par ID
   */
  getConversation: async (conversationId: string): Promise<CreateConversationResponseV2> => {
    return authFetchV2WithRefresh(`/conversations/${conversationId}`);
  },

  // ========================
  // MESSAGES
  // ========================

  /**
   * Lister les messages d'une conversation
   */
  listMessages: async (
    conversationId: string,
    options?: { limit?: number; before?: number }
  ): Promise<{ messages: MessageV2[]; hasMore: boolean }> => {
    const params = new URLSearchParams();
    if (options?.limit) { params.append("limit", options.limit.toString()); }
    if (options?.before) { params.append("before", options.before.toString()); }

    // ✅ Use RESTful route: /conversations/:id/messages
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return authFetchV2WithRefresh(`/conversations/${conversationId}/messages${queryString}`);
  },

  /**
   * Envoyer un message
   */
  sendMessage: async (
    conversationId: string,
    body: string,
    options?: { scheduledBurnAt?: number; unlockBlockHeight?: number; burnDelay?: number }
  ): Promise<MessageV2> => {
    return authFetchV2WithRefresh("/messages", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        body,
        ...options,
      }),
    });
  },

  /**
   * Accuser réception d'un message Burn After Reading
   * Démarre le compte à rebours pour la destruction
   */
  acknowledgeMessage: async (
    messageId: string,
    conversationId: string
  ): Promise<{ success: boolean; scheduledBurnAt?: number }> => {
    return authFetchV2WithRefresh(`/messages/${messageId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
  },

  /**
   * Brûler un message immédiatement
   */
  burnMessageNow: async (messageId: string): Promise<{ success: boolean; burnedAt?: number }> => {
    return authFetchV2WithRefresh(`/messages/${messageId}/burn`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  /**
   * Brûler un message manuellement
   */
  burnMessage: async (
    messageId: string
  ): Promise<{ success: boolean; burnedAt: number }> => {
    return authFetchV2WithRefresh("/messages/burn", {
      method: "POST",
      body: JSON.stringify({ messageId }),
    });
  },

  // ========================
  // USERS (Search)
  // ========================

  /**
   * Rechercher des utilisateurs
   */
  searchUsers: async (query: string): Promise<{
    users: Array<{
      id: string;
      username: string;
      securityTier: 'standard' | 'dice-key';
      online: boolean;
      status?: 'online' | 'busy' | 'away';
      lastSeen?: number;
    }>;
    total: number
  }> => {
    const params = new URLSearchParams({ q: query });
    return authFetchV2WithRefresh(`/users/search?${params.toString()}`);
  },

  /**
   * Get current user's status
   */
  getMyStatus: async (): Promise<{ status: 'online' | 'busy' | 'away' | 'invisible' | 'offline' }> => {
    return authFetchV2WithRefresh("/users/me/status");
  },

  /**
   * Update current user's status
   */
  updateMyStatus: async (status: 'online' | 'busy' | 'away' | 'invisible'): Promise<{ success: boolean; status: string }> => {
    return authFetchV2WithRefresh("/users/me/status", {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  },

  // ========================
  // CONVERSATION REQUESTS
  // ========================

  /**
   * Envoyer une demande de conversation
   */
  sendConversationRequest: async (
    targetUsername: string,
    message?: string
  ): Promise<{ success: boolean; request: any }> => {
    return authFetchV2WithRefresh("/conversation-requests", {
      method: "POST",
      body: JSON.stringify({ targetUsername, message }),
    });
  },

  /**
   * Récupérer les demandes reçues
   */
  getReceivedRequests: async (): Promise<{ requests: any[] }> => {
    return authFetchV2WithRefresh("/conversation-requests/received");
  },

  /**
   * Récupérer les demandes envoyées
   */
  getSentRequests: async (): Promise<{ requests: any[] }> => {
    return authFetchV2WithRefresh("/conversation-requests/sent");
  },

  /**
   * Accepter une demande de conversation
   */
  acceptConversationRequest: async (
    requestId: string
  ): Promise<{ success: boolean; conversation: any }> => {
    return authFetchV2WithRefresh(`/conversation-requests/${requestId}/accept`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  /**
   * Refuser une demande de conversation
   */
  rejectConversationRequest: async (
    requestId: string
  ): Promise<{ success: boolean }> => {
    return authFetchV2WithRefresh(`/conversation-requests/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  // ========================
  // E2EE KEY MANAGEMENT
  // ========================

  /**
   * Publier le bundle de clés E2EE de l'utilisateur
   * Supports both old format (string[]) and new X3DH format ({id, publicKey}[])
   */
  publishKeyBundle: async (keyBundle: {
    identityKey: string;
    fingerprint: string;
    signedPreKey: {
      keyId: number;
      publicKey: string;
      signature: string;
    };
    oneTimePreKeys: string[] | Array<{ id: number; publicKey: string }>;
  }): Promise<{ success: boolean }> => {
    return authFetchV2WithRefresh("/e2ee/publish-keys", {
      method: "POST",
      body: JSON.stringify(keyBundle),
    });
  },

  /**
   * Récupérer le bundle de clés E2EE d'un utilisateur
   */
  getPeerKeyBundle: async (username: string): Promise<{
    identityKey: string;
    signingKey?: string | null;  // Ed25519 public key for SPK verification
    fingerprint: string;
    signedPreKey: {
      keyId: number;
      publicKey: string;
      signature: string;  // Ed25519 signature
    };
    oneTimePreKeys: string[];
  } | null> => {
    try {
      return await authFetchV2WithRefresh(`/e2ee/keys/${encodeURIComponent(username)}`);
    } catch (error: any) {
      // 404 means user hasn't published keys yet
      if (error.message?.includes('404') || error.message?.includes('No key bundle')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Consommer une One-Time Pre-Key pour X3DH handshake
   * Récupère et supprime atomiquement une OPK du bundle du peer
   */
  consumeOPK: async (username: string): Promise<{
    identityKey: string;
    signingKey?: string | null;  // Ed25519 public key for SPK verification
    fingerprint: string;
    signedPreKey: {
      keyId: number;
      publicKey: string;
      signature: string;  // Ed25519 signature
    };
    oneTimePreKey: { id: number; publicKey: string } | string | null;
  } | null> => {
    try {
      return await authFetchV2WithRefresh(`/e2ee/consume-opk/${encodeURIComponent(username)}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('No key bundle')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Replenish one-time pre-keys
   */
  replenishOPKs: async (oneTimePreKeys: Array<{ id: number; publicKey: string }>): Promise<{
    success: boolean;
    totalOPKs: number;
  }> => {
    return authFetchV2WithRefresh("/e2ee/replenish-opks", {
      method: "POST",
      body: JSON.stringify({ oneTimePreKeys }),
    });
  },
};

// ============================================================================
// HELPER: Convertir mnemonic vers masterKey (BIP-39 seed)
// ============================================================================

/**
 * Convertit un mnemonic BIP-39 en seed (masterKey) pour le login
 * Nécessite la bibliothèque bip39
 * 
 * IMPORTANT: Doit correspondre exactement à la dérivation du backend lors du signup
 * Backend: seed.subarray(0, 32).toString('hex')
 */
export async function mnemonicToMasterKey(mnemonic: string): Promise<string> {
  // Import dynamique de bip39
  const bip39 = await import("bip39");
  const seed = await bip39.mnemonicToSeed(mnemonic);
  // ✅ Prendre seulement les 32 premiers octets (256 bits) comme le backend
  return seed.subarray(0, 32).toString("hex");
}

/**
 * Récupère les clés de récupération CHIFFREES depuis le backend
 * SECURITY: Le backend retourne les données chiffrées - le client doit les déchiffrer localement
 * MasterKey n'est JAMAIS envoyée au serveur
 */
export async function getRecoveryKeys(accessToken: string): Promise<{
  success: boolean;
  securityTier: SecurityTier;
  encryptedMnemonic: string; // Encrypted - must decrypt locally
  encryptedChecksums: string | null; // Encrypted - must decrypt locally (DiceKey only)
  username: string;
  userId: string;
  createdAt: string;
  _security: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v2/auth/recovery-keys`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Échec de la récupération des clés");
  }

  return response.json();
}

// ============================================================================
// PUBLIC KEY MANAGEMENT (e2ee-v2)
// ============================================================================

export interface PublicKeyResponseV2 {
  userId: string;
  username: string;
  publicKey: string;       // Base64 encoded Curve25519 public key
  signPublicKey: string;   // Base64 encoded Ed25519 public key
}

/**
 * Get public keys for multiple users
 * 
 * @param userIds Array of user IDs
 * @returns Array of public keys
 */
export async function getPublicKeys(userIds: string[]): Promise<{ keys: PublicKeyResponseV2[] }> {
  const response = await authFetchV2WithRefresh(`${API_BASE_URL}/api/v2/users/public-keys`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });

  return response;
}

/**
 * Upload/update current user's public keys
 * Called once after key generation
 * 
 * @param publicKey Base64 encoded Curve25519 public key
 * @param signPublicKey Base64 encoded Ed25519 public key
 */
export async function uploadPublicKeys(publicKey: string, signPublicKey: string): Promise<void> {
  await authFetchV2WithRefresh(`${API_BASE_URL}/api/v2/users/me/public-keys`, {
    method: 'PUT',
    body: JSON.stringify({ publicKey, signPublicKey }),
  });
}

export interface ConversationMemberV2 {
  userId: string;
  username: string;
  publicKey?: string;       // Optional: may not be available yet
  signPublicKey?: string;   // Optional: may not be available yet
}

/**
 * Get all members of a conversation
 * Includes public keys if available
 * 
 * @param conversationId Conversation ID
 * @returns Array of conversation members
 */
export async function getConversationMembers(conversationId: string): Promise<ConversationMemberV2[]> {
  const response = await authFetchV2WithRefresh(
    `${API_BASE_URL}/api/v2/conversations/${conversationId}/members`,
    {
      method: 'GET',
    }
  );

  return response.members;
}
