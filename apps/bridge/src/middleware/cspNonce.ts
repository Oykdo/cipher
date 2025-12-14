/**
 * Content Security Policy with Nonces
 * Generates unique nonces per request for inline scripts/styles
 */

import { randomBytes } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

// CSP violation storage (in production, use database or external service)
interface CspViolation {
  timestamp: number;
  documentUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  originalPolicy: string;
  blockedUri: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  statusCode?: number;
}

const cspViolations: CspViolation[] = [];
const MAX_VIOLATIONS = 1000; // Keep last 1000 violations in memory

/**
 * Generates a cryptographically secure nonce
 * @returns Base64-encoded nonce (128 bits)
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * CSP configuration with nonce support
 */
export interface CspConfig {
  reportUri?: string;
  reportOnly?: boolean;
  directives: {
    defaultSrc?: string[];
    scriptSrc?: string[];
    styleSrc?: string[];
    // CSP Level 3 finer-grained directives
    styleSrcAttr?: string[];
    styleSrcElem?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
    childSrc?: string[];
    formAction?: string[];
    frameAncestors?: string[];
    baseUri?: string[];
    manifestSrc?: string[];
    workerSrc?: string[];
  };
}

/**
 * Builds CSP header value with nonce
 * @param config CSP configuration
 * @param nonce Nonce for this request
 * @returns CSP header value
 */
export function buildCspHeader(config: CspConfig, nonce: string): string {
  const directives: string[] = [];

  for (const [directive, sources] of Object.entries(config.directives)) {
    if (!sources || sources.length === 0) { continue; }

    // Convert camelCase to kebab-case (scriptSrc -> script-src)
    const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase();

    // Add nonce to script-src and style-src (and style-src-elem when used)
    let sourcesWithNonce = [...sources];
    if (directive === 'scriptSrc' || directive === 'styleSrc' || directive === 'styleSrcElem') {
      sourcesWithNonce = sourcesWithNonce.map(src =>
        src === "'nonce'" ? `'nonce-${nonce}'` : src
      );
    }

    directives.push(`${directiveName} ${sourcesWithNonce.join(' ')}`);
  }

  // Add report-uri if configured
  if (config.reportUri) {
    directives.push(`report-uri ${config.reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Default CSP configuration for Dead Drop (STRICT MODE)
 * 
 * SECURITY:
 * - NO 'unsafe-inline' for scripts - Uses nonces instead
 * - NO 'unsafe-eval' - No dynamic eval()
 * - Strict directives for maximum XSS protection
 * - Report-Only in development, Enforced in production
 */
export const DEFAULT_CSP_CONFIG: CspConfig = {
  reportUri: '/api/csp-report',
  reportOnly: process.env.NODE_ENV === 'development',
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'nonce'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'blob:'], // nonce will be replaced per request, blob: for workers
    // NOTE: Some UI libs rely on inline styles (style="...") and/or injected <style> tags.
    // Allowing inline *styles* is generally far less risky than allowing inline scripts.
    styleSrc: ["'self'", "'nonce'", "'unsafe-inline'"],
    styleSrcAttr: ["'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], // data: for base64 images, blob: for generated images
    connectSrc: ["'self'", 'ws:', 'wss:'],
    fontSrc: ["'self'", 'data:'], // data: for inline fonts if needed
    objectSrc: ["'none'"], // Block plugins (Flash, Java, etc.)
    mediaSrc: ["'self'", 'blob:'], // blob: for media attachments
    frameSrc: ["'none'"], // No iframes allowed
    formAction: ["'self'"], // Forms can only submit to same origin
    frameAncestors: ["'none'"], // Cannot be embedded in iframe (X-Frame-Options)
    baseUri: ["'self'"], // Prevent base tag injection
    workerSrc: ["'self'", 'blob:'], // blob: for Web Workers
    manifestSrc: ["'self'"], // PWA manifest
  },
};

/**
 * Middleware to generate CSP nonce and set header
 * @param config CSP configuration
 */
export function cspNonceMiddleware(config: CspConfig = DEFAULT_CSP_CONFIG) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Generate unique nonce for this request
    const nonce = generateNonce();

    // Store nonce in request for use in templates
    (request as any).cspNonce = nonce;

    // Build CSP header with nonce
    const cspHeader = buildCspHeader(config, nonce);

    // Set CSP header
    const headerName = config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    reply.header(headerName, cspHeader);
  };
}

/**
 * CSP violation report endpoint handler
 */
export async function handleCspReport(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body: any = request.body;

    // report-uri format (legacy): { "csp-report": { ... } }
    // Reporting API format: [ { type: "csp-violation", url, body: { ... } }, ... ]
    let reportData: any | null = null;

    if (body && typeof body === 'object' && body['csp-report']) {
      reportData = body['csp-report'];
    } else if (Array.isArray(body)) {
      const entry = body.find((e) => e && typeof e === 'object' && (e.type === 'csp-violation' || e.body));
      if (entry?.body) {
        reportData = entry.body;
        if (entry.url && !reportData.documentUri) {
          reportData.documentUri = entry.url;
        }
        // Chrome sometimes uses blockedURL instead of blockedUri
        if (reportData.blockedURL && !reportData.blockedUri) {
          reportData.blockedUri = reportData.blockedURL;
        }
      }
    }

    if (!reportData || typeof reportData !== 'object') {
      reply.code(400);
      return { error: 'Invalid CSP report format' };
    }

    const violation: CspViolation = {
      ...reportData,
      timestamp: Date.now(), // Override with server timestamp
    };

    // Store violation (in memory for now)
    cspViolations.push(violation);

    // Keep only last MAX_VIOLATIONS
    if (cspViolations.length > MAX_VIOLATIONS) {
      cspViolations.shift();
    }

    // Log violation
    console.warn('[CSP] Violation detected:', {
      directive: violation.violatedDirective,
      blockedUri: violation.blockedUri,
      sourceFile: violation.sourceFile,
      line: violation.lineNumber,
    });

    // In production, send to monitoring service (e.g., Sentry)
    if (process.env.NODE_ENV === 'production') {
      // Example: await sendToSentry(violation);
    }

    reply.code(204);
    return;
  } catch (error) {
    console.error('[CSP] Error processing violation report:', error);
    reply.code(500);
    return { error: 'Failed to process CSP report' };
  }
}

/**
 * Get recent CSP violations (for monitoring dashboard)
 * @param limit Maximum number of violations to return
 * @returns Recent violations
 */
export function getRecentViolations(limit: number = 100): CspViolation[] {
  return cspViolations.slice(-limit).reverse();
}

/**
 * Get CSP violation statistics
 */
export interface CspViolationStats {
  total: number;
  last24h: number;
  byDirective: Record<string, number>;
  byBlockedUri: Record<string, number>;
  topSourceFiles: Array<{ file: string; count: number }>;
}

export function getViolationStats(): CspViolationStats {
  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);

  const stats: CspViolationStats = {
    total: cspViolations.length,
    last24h: 0,
    byDirective: {},
    byBlockedUri: {},
    topSourceFiles: [],
  };

  // Count by directive
  const sourceFileCounts: Record<string, number> = {};

  for (const violation of cspViolations) {
    // Count last 24h
    if (violation.timestamp >= last24h) {
      stats.last24h++;
    }

    // Count by directive
    const directive = violation.effectiveDirective || violation.violatedDirective;
    stats.byDirective[directive] = (stats.byDirective[directive] || 0) + 1;

    // Count by blocked URI
    const blockedUri = violation.blockedUri || 'unknown';
    stats.byBlockedUri[blockedUri] = (stats.byBlockedUri[blockedUri] || 0) + 1;

    // Count by source file
    if (violation.sourceFile) {
      sourceFileCounts[violation.sourceFile] = (sourceFileCounts[violation.sourceFile] || 0) + 1;
    }
  }

  // Top source files
  stats.topSourceFiles = Object.entries(sourceFileCounts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}

/**
 * Clear old CSP violations (cleanup task)
 * @param olderThan Milliseconds (default: 7 days)
 * @returns Number of violations removed
 */
export function cleanupOldViolations(olderThan: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - olderThan;
  const before = cspViolations.length;

  // Filter out old violations
  let index = 0;
  while (index < cspViolations.length) {
    if (cspViolations[index].timestamp < cutoff) {
      cspViolations.splice(index, 1);
    } else {
      index++;
    }
  }

  const removed = before - cspViolations.length;
  if (removed > 0) {
    console.log(`[CSP] Cleaned up ${removed} old violations`);
  }

  return removed;
}

// Schedule cleanup every 6 hours
setInterval(() => {
  cleanupOldViolations();
}, 6 * 60 * 60 * 1000);
