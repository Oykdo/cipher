/**
 * AES-GCM Encryption Service
 * 
 * Chiffrement end-to-end des messages avec AES-256-GCM
 * Utilise Web Crypto API native du navigateur
 */

export interface EncryptedMessage {
  ciphertext: string; // Base64
  iv: string; // Base64
  tag: string; // Base64 (auth tag)
}

/**
 * Génère une clé de chiffrement à partir d'un secret partagé
 * Utilise PBKDF2 pour dériver une clé AES-256
 */
export async function deriveEncryptionKey(
  sharedSecret: string,
  salt: string = 'dead-drop-e2e'
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import du secret comme matériel de clé
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sharedSecret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Dérivation de la clé AES-256-GCM
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Chiffre un message avec AES-256-GCM
 * @param plaintext Message en clair
 * @param key Clé de chiffrement (CryptoKey)
 * @returns Message chiffré avec IV et tag d'authentification
 */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedMessage> {
  const encoder = new TextEncoder();

  // Génération d'un IV aléatoire (12 bytes pour GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Chiffrement avec AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128, // 16 bytes auth tag
    },
    key,
    encoder.encode(plaintext)
  );

  // Extraction du tag (derniers 16 bytes)
  const ciphertextArray = new Uint8Array(ciphertext);
  const dataLength = ciphertextArray.length - 16;
  const data = ciphertextArray.slice(0, dataLength);
  const tag = ciphertextArray.slice(dataLength);

  // Encodage en Base64
  return {
    ciphertext: arrayBufferToBase64(data),
    iv: arrayBufferToBase64(iv),
    tag: arrayBufferToBase64(tag),
  };
}

/**
 * Déchiffre un message avec AES-256-GCM
 * @param encrypted Message chiffré
 * @param key Clé de déchiffrement (CryptoKey)
 * @returns Message en clair
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  key: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder();

  // Décodage Base64
  const ciphertext = base64ToArrayBuffer(encrypted.ciphertext);
  const iv = base64ToArrayBuffer(encrypted.iv);
  const tag = base64ToArrayBuffer(encrypted.tag);

  // Concaténation ciphertext + tag
  const ciphertextWithTag = new Uint8Array(ciphertext.byteLength + tag.byteLength);
  ciphertextWithTag.set(new Uint8Array(ciphertext), 0);
  ciphertextWithTag.set(new Uint8Array(tag), ciphertext.byteLength);

  // Déchiffrement avec AES-GCM
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      tagLength: 128,
    },
    key,
    ciphertextWithTag
  );

  return decoder.decode(plaintext);
}

/**
 * Génère une clé de conversation unique basée sur les deux participants
 * Utilise un secret partagé dérivé de leurs identités
 */
export function generateConversationKey(userId1: string, userId2: string): string {
  // Tri alphabétique pour garantir la même clé peu importe l'ordre
  const sortedIds = [userId1, userId2].sort();
  return `conv-${sortedIds[0]}-${sortedIds[1]}`;
}

/**
 * Génère une clé de chiffrement pour une conversation
 * 
 * SECURITY: La clé est dérivée à partir du masterKey ET du conversationId.
 * - Le masterKey apporte l'entropie secrète de l'utilisateur
 * - Le conversationId assure une clé unique par conversation
 * 
 * SECURITY FIX VUL-009: Removed weak fallback that only used conversationId
 * A valid masterKey is now REQUIRED for all encryption operations.
 */
export async function generateConversationEncryptionKey(
  masterKey: string,
  conversationId: string
): Promise<CryptoKey> {
  // SECURITY FIX VUL-009: Reject weak or missing masterKey
  if (!masterKey || masterKey.length < 32) {
    throw new Error('SECURITY: Valid masterKey required for encryption (minimum 32 chars)');
  }

  // Combine masterKey + conversationId pour créer le secret
  // Le salt utilise aussi le conversationId pour unicité
  const combinedSecret = `${masterKey}:${conversationId}`;
  const salt = `dead-drop-e2e:${conversationId}`;

  return deriveEncryptionKey(combinedSecret, salt);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convertit un ArrayBuffer en Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convertit une string Base64 en ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================================
// CACHE DE CLÉS (pour éviter de recalculer)
// SECURITY FIX VULN-003: Include masterKey hash in cache key
// SECURITY FIX LOGIC-001: Prevent race conditions with pending keys map
// ============================================================================

const keyCache = new Map<string, CryptoKey>();
const pendingKeys = new Map<string, Promise<CryptoKey>>();

/**
 * Compute a short hash of the masterKey for cache key derivation
 * SECURITY FIX VULN-003: Prevents cache collisions between different users
 */
async function computeMasterKeyHash(masterKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(masterKey));
  const hashArray = new Uint8Array(hashBuffer);
  // Use first 8 bytes (16 hex chars) as identifier
  return Array.from(hashArray.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Récupère ou génère une clé de chiffrement pour une conversation
 * Utilise un cache pour améliorer les performances
 * 
 * SECURITY FIX VULN-003: Cache key now includes masterKey hash to prevent collisions
 * SECURITY FIX LOGIC-001: Uses pendingKeys map to prevent race conditions
 */
export async function getOrCreateConversationKey(
  masterKey: string,
  conversationId: string
): Promise<CryptoKey> {
  // SECURITY FIX VULN-003: Include masterKey hash in cache key
  const masterKeyHash = await computeMasterKeyHash(masterKey);
  const cacheKey = `${masterKeyHash}:${conversationId}`;

  // Check existing cache
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey)!;
  }

  // SECURITY FIX LOGIC-001: Check if key generation is already in progress
  if (pendingKeys.has(cacheKey)) {
    return pendingKeys.get(cacheKey)!;
  }

  // Generate new key with deduplication
  const keyPromise = generateConversationEncryptionKey(masterKey, conversationId);
  pendingKeys.set(cacheKey, keyPromise);

  try {
    const key = await keyPromise;
    keyCache.set(cacheKey, key);
    return key;
  } finally {
    // Always cleanup pending entry
    pendingKeys.delete(cacheKey);
  }
}

/**
 * Nettoie le cache de clés (à appeler lors de la déconnexion)
 */
export function clearKeyCache(): void {
  keyCache.clear();
  pendingKeys.clear();
}

// ============================================================================
// API SIMPLIFIÉE
// ============================================================================

/**
 * Chiffre un message pour une conversation
 */
export async function encryptForConversation(
  plaintext: string,
  masterKey: string,
  conversationId: string
): Promise<EncryptedMessage> {
  const key = await getOrCreateConversationKey(masterKey, conversationId);
  return encryptMessage(plaintext, key);
}

/**
 * Déchiffre un message d'une conversation
 */
export async function decryptFromConversation(
  encrypted: EncryptedMessage,
  masterKey: string,
  conversationId: string
): Promise<string> {
  const key = await getOrCreateConversationKey(masterKey, conversationId);
  return decryptMessage(encrypted, key);
}
