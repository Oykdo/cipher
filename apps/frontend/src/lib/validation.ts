/**
 * Client-Side Input Validation
 * Defense in depth - validate before sending to server
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates username format and length
 * @param username Username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): ValidationResult {
  if (!username || username.trim().length === 0) {
    return { isValid: false, error: "Le nom d'utilisateur est requis" };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { isValid: false, error: "Le nom d'utilisateur doit contenir au moins 3 caractères" };
  }

  if (trimmed.length > 32) {
    return { isValid: false, error: "Le nom d'utilisateur ne peut pas dépasser 32 caractères" };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores",
    };
  }

  // Check for suspicious patterns
  if (/^[_-]+$/.test(trimmed)) {
    return { isValid: false, error: "Le nom d'utilisateur doit contenir au moins une lettre ou un chiffre" };
  }

  return { isValid: true };
}

/**
 * Validates message content
 * @param message Message to validate
 * @returns Validation result with error message if invalid
 */
export function validateMessage(message: string): ValidationResult {
  if (!message || message.trim().length === 0) {
    return { isValid: false, error: "Le message ne peut pas être vide" };
  }

  // Check maximum length (100KB = ~100,000 characters)
  if (message.length > 100000) {
    return {
      isValid: false,
      error: "Le message est trop long (maximum 100 000 caractères)",
    };
  }

  // Check for null bytes (potential injection attacks)
  if (message.includes('\0')) {
    return { isValid: false, error: "Le message contient des caractères invalides" };
  }

  return { isValid: true };
}

/**
 * Validates Dice-Key master key hex format
 * @param masterKeyHex Hex string to validate
 * @returns Validation result with error message if invalid
 */
export function validateMasterKeyHex(masterKeyHex: string): ValidationResult {
  if (!masterKeyHex || masterKeyHex.trim().length === 0) {
    return { isValid: false, error: "La clé maître est requise" };
  }

  const trimmed = masterKeyHex.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/i.test(trimmed)) {
    return {
      isValid: false,
      error: "La clé maître doit être une chaîne hexadécimale de 64 caractères (256 bits)",
    };
  }

  // Check for weak keys (all zeros, all ones, repeating pattern)
  if (/^0{64}$/.test(trimmed) || /^f{64}$/i.test(trimmed)) {
    return { isValid: false, error: "Cette clé maître est trop faible" };
  }

  // Check for repeating patterns
  if (/^(.{2})\1{31}$/.test(trimmed)) {
    return { isValid: false, error: "Cette clé maître contient un motif répétitif" };
  }

  return { isValid: true };
}

/**
 * Validates file size for attachments
 * @param sizeInBytes File size in bytes
 * @param maxSizeInMB Maximum allowed size in megabytes (default: 25MB)
 * @returns Validation result with error message if invalid
 */
export function validateFileSize(
  sizeInBytes: number,
  maxSizeInMB: number = 25
): ValidationResult {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;

  if (sizeInBytes <= 0) {
    return { isValid: false, error: "Le fichier est vide" };
  }

  if (sizeInBytes > maxSizeInBytes) {
    return {
      isValid: false,
      error: `Le fichier est trop volumineux (maximum ${maxSizeInMB} MB)`,
    };
  }

  return { isValid: true };
}

/**
 * Validates filename
 * @param filename Filename to validate
 * @returns Validation result with error message if invalid
 */
export function validateFilename(filename: string): ValidationResult {
  if (!filename || filename.trim().length === 0) {
    return { isValid: false, error: "Le nom du fichier est requis" };
  }

  const trimmed = filename.trim();

  if (trimmed.length > 255) {
    return { isValid: false, error: "Le nom du fichier est trop long (maximum 255 caractères)" };
  }

  // Check for path traversal attacks
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { isValid: false, error: "Le nom du fichier contient des caractères invalides" };
  }

  // Check for null bytes
  if (trimmed.includes('\0')) {
    return { isValid: false, error: "Le nom du fichier contient des caractères invalides" };
  }

  return { isValid: true };
}

/**
 * Validates conversationId format
 * @param conversationId Conversation ID to validate
 * @returns Validation result with error message if invalid
 */
export function validateConversationId(conversationId: string): ValidationResult {
  if (!conversationId) {
    return { isValid: false, error: "L'ID de conversation est requis" };
  }

  // Format: "uuid:uuid"
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const parts = conversationId.split(':');

  if (parts.length !== 2) {
    return { isValid: false, error: "Format d'ID de conversation invalide" };
  }

  if (!uuidPattern.test(parts[0]) || !uuidPattern.test(parts[1])) {
    return { isValid: false, error: "Format d'ID de conversation invalide" };
  }

  return { isValid: true };
}

/**
 * Sanitizes user input to prevent XSS (basic sanitization)
 * Note: React already escapes content, this is an additional layer
 * @param input Input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates and normalizes a search query
 * @param query Search query
 * @returns Validation result with normalized query
 */
export function validateSearchQuery(query: string): ValidationResult & { normalized?: string } {
  if (!query || query.trim().length === 0) {
    return { isValid: false, error: "La requête de recherche est requise" };
  }

  const trimmed = query.trim();

  if (trimmed.length < 1) {
    return { isValid: false, error: "La requête est trop courte" };
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: "La requête est trop longue (maximum 50 caractères)" };
  }

  // Normalize: lowercase, remove extra spaces
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');

  return { isValid: true, normalized };
}
