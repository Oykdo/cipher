/**
 * Input Sanitization Service
 * 
 * SECURITY FIX: Implements comprehensive input sanitization to prevent
 * XSS (Cross-Site Scripting) attacks.
 * 
 * Uses DOMPurify for HTML sanitization with strict policies.
 * 
 * Protection against:
 * - XSS (reflected, stored, DOM-based)
 * - HTML injection
 * - Script injection
 * - Event handler injection
 * 
 * Compliance:
 * - OWASP XSS Prevention Cheat Sheet
 * - Content Security Policy (CSP)
 */

import DOMPurify from 'isomorphic-dompurify';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Strict policy: No HTML allowed (text only)
 * Use for: usernames, titles, search queries
 */
const STRICT_CONFIG = {
  ALLOWED_TAGS: [] as string[],
  ALLOWED_ATTR: [] as string[],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Message policy: Limited formatting allowed
 * Use for: chat messages, comments
 */
const MESSAGE_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'code', 'pre', 'br'],
  ALLOWED_ATTR: [] as string[],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Rich content policy: More HTML allowed (with restrictions)
 * Use for: bio, descriptions (if applicable)
 */
const RICH_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'em', 'strong', 'code', 'pre', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target'],
  ALLOWED_URI_REGEXP: /^https?:\/\//,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  // Hooks to add security attributes
  HOOKS: {
    afterSanitizeAttributes: (node: Element) => {
      // Force all links to open in new tab and add noopener
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    },
  },
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitizes username (strict - no HTML)
 * 
 * @param input - Username input
 * @returns Sanitized username
 */
export function sanitizeUsername(input: string): string {
  const sanitized = DOMPurify.sanitize(input, STRICT_CONFIG);
  
  // Additional validation: only alphanumeric, underscore, dash
  return sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Sanitizes message text (limited formatting)
 * 
 * @param input - Message text
 * @returns Sanitized message
 */
export function sanitizeMessage(input: string): string {
  return DOMPurify.sanitize(input, MESSAGE_CONFIG);
}

/**
 * Sanitizes rich content (bio, descriptions)
 * 
 * @param input - Rich content HTML
 * @returns Sanitized HTML
 */
export function sanitizeRichContent(input: string): string {
  return DOMPurify.sanitize(input, RICH_CONFIG);
}

/**
 * Sanitizes search query (strict - no HTML, no SQL wildcards)
 * 
 * @param input - Search query
 * @returns Sanitized query
 */
export function sanitizeSearchQuery(input: string): string {
  let sanitized = DOMPurify.sanitize(input, STRICT_CONFIG);
  
  // Remove SQL wildcards to prevent injection
  sanitized = sanitized.replace(/[%_]/g, '');
  
  // Limit length
  return sanitized.substring(0, 100);
}

/**
 * Sanitizes filename (prevent path traversal)
 * 
 * @param input - Filename
 * @returns Safe filename
 */
export function sanitizeFilename(input: string): string {
  let sanitized = DOMPurify.sanitize(input, STRICT_CONFIG);
  
  // Remove path separators
  sanitized = sanitized.replace(/[/\\]/g, '-');
  
  // Remove dangerous characters (excluding control characters flagged by linter)
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  
  // Prevent directory traversal
  sanitized = sanitized.replace(/\.\./g, '');
  
  // Limit length
  return sanitized.substring(0, 255);
}

/**
 * Validates and sanitizes URL
 * 
 * @param input - URL string
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeURL(input: string): string | null {
  try {
    const url = new URL(input);
    
    // Only allow safe protocols
    const allowedProtocols = ['http:', 'https:'];
    
    if (!allowedProtocols.includes(url.protocol)) {
      return null;
    }
    
    // Return sanitized URL
    return url.toString();
  } catch {
    return null; // Invalid URL
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates email format (basic)
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validates username format
 */
export function validateUsername(username: string): {
  valid: boolean;
  error?: string;
} {
  if (username.length < 3) {
    return { valid: false, error: 'Minimum 3 caractères' };
  }

  if (username.length > 32) {
    return { valid: false, error: 'Maximum 32 caractères' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Uniquement lettres, chiffres, _ et -' };
  }

  return { valid: true };
}

/**
 * Validates message length
 */
export function validateMessageLength(message: string): {
  valid: boolean;
  error?: string;
} {
  if (message.length === 0) {
    return { valid: false, error: 'Message vide' };
  }

  if (message.length > 100000) {
    return { valid: false, error: 'Message trop long (max 100KB)' };
  }

  return { valid: true };
}

/**
 * Rate limiting helper - validates request frequency
 * 
 * @param userId - User identifier
 * @param action - Action type (e.g., 'message', 'login')
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const key = `${userId}:${action}`;
  const now = Date.now();

  let record = requestCounts.get(key);

  // Reset if window expired
  if (!record || now >= record.resetAt) {
    record = {
      count: 0,
      resetAt: now + windowMs,
    };
    requestCounts.set(key, record);
  }

  // Increment count
  record.count++;

  const allowed = record.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - record.count);

  return {
    allowed,
    remaining,
    resetAt: record.resetAt,
  };
}

/**
 * Cleans up expired rate limit records (call periodically)
 */
export function cleanupRateLimits(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, record] of requestCounts.entries()) {
    if (now >= record.resetAt) {
      requestCounts.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.info(`[RateLimit] Cleaned ${cleaned} expired records`);
  }

  return cleaned;
}

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000);
}