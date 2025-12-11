/**
 * Input Sanitization Utilities
 * 
 * SECURITY: Centralized sanitization for user inputs
 * Protects against XSS, injection attacks, and malicious content
 * 
 * Uses DOMPurify for HTML sanitization
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * @param dirty - Untrusted HTML string
 * @param options - DOMPurify configuration options
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHTML(dirty: string, options?: Record<string, any>): string {
  const result = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
    ...options,
  });
  return String(result);
}

/**
 * Sanitize plain text (strip all HTML)
 * 
 * @param text - Untrusted text
 * @returns Plain text with HTML stripped
 */
export function sanitizeText(text: string): string {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize username (alphanumeric + limited special chars)
 * 
 * @param username - Untrusted username
 * @returns Sanitized username or null if invalid
 */
export function sanitizeUsername(username: string): string | null {
  // Allow: letters, numbers, underscore, hyphen, dot
  // Length: 3-30 characters
  const cleaned = username.trim();
  
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(cleaned)) {
    return null;
  }
  
  // Prevent directory traversal
  if (cleaned.includes('..') || cleaned.includes('//')) {
    return null;
  }
  
  return cleaned;
}

/**
 * Sanitize message content
 * 
 * @param message - Untrusted message content
 * @param maxLength - Maximum allowed length
 * @returns Sanitized message
 */
export function sanitizeMessage(message: string, maxLength: number = 10000): string {
  const cleaned = message.trim();
  
  if (cleaned.length > maxLength) {
    throw new Error(`Message exceeds maximum length of ${maxLength} characters`);
  }
  
  // Strip dangerous HTML but allow basic formatting
  return sanitizeHTML(cleaned);
}

/**
 * Sanitize file name
 * 
 * @param filename - Untrusted filename
 * @returns Sanitized filename or null if invalid
 */
export function sanitizeFilename(filename: string): string | null {
  const cleaned = filename.trim();
  
  // Remove path separators and null bytes
  const safe = cleaned.replace(/[/\\:\0]/g, '');
  
  // Prevent directory traversal
  if (safe.includes('..') || safe.startsWith('.')) {
    return null;
  }
  
  // Limit length
  if (safe.length > 255) {
    return null;
  }
  
  return safe;
}

/**
 * Validate and sanitize URL
 * 
 * @param url - Untrusted URL
 * @param allowedProtocols - Allowed URL protocols
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeURL(
  url: string,
  allowedProtocols: string[] = ['http', 'https']
): string | null {
  try {
    const parsed = new URL(url);
    
    if (!allowedProtocols.includes(parsed.protocol.replace(':', ''))) {
      return null;
    }
    
    // Prevent javascript: and data: URLs
    if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
      return null;
    }
    
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Escape special characters for use in regex
 * 
 * @param str - String to escape
 * @returns Escaped string safe for regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize search query
 * 
 * @param query - Untrusted search query
 * @param maxLength - Maximum query length
 * @returns Sanitized query
 */
export function sanitizeSearchQuery(query: string, maxLength: number = 100): string {
  const cleaned = query.trim();
  
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength);
  }
  
  // Remove control characters
  return cleaned.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * SECURITY FIX VULN-005: Sanitize i18n translation strings for safe HTML rendering
 * 
 * Use this function when rendering translated strings with dangerouslySetInnerHTML.
 * It allows only safe formatting tags like <strong>, <em>, <br>, <span>, <code>.
 * 
 * @param translation - Translation string that may contain HTML
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function sanitizeTranslation(translation: string): string {
  return DOMPurify.sanitize(translation, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'span', 'code', 'u', 'mark'],
    ALLOWED_ATTR: ['class', 'style'],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
    // Forbid dangerous protocols in any remaining attributes
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover'],
  });
}

/**
 * SECURITY FIX VULN-005: Create a safe HTML object for React's dangerouslySetInnerHTML
 * 
 * This is a convenience wrapper that sanitizes and returns the object format
 * expected by React's dangerouslySetInnerHTML prop.
 * 
 * @param html - HTML string to sanitize
 * @returns Object with __html property containing sanitized HTML
 */
export function createSafeHTML(html: string): { __html: string } {
  return { __html: sanitizeTranslation(html) };
}
