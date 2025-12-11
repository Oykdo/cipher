/**
 * HTTPS Enforcement and Security Headers Utilities
 * Ensures all production traffic uses HTTPS with proper security headers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * HTTPS enforcement configuration
 */
export interface HttpsConfig {
  enabled: boolean;
  trustProxy: boolean;
  hstsMaxAge: number;
  hstsIncludeSubDomains: boolean;
  hstsPreload: boolean;
  redirectCode: 301 | 302 | 307 | 308;
}

export const DEFAULT_HTTPS_CONFIG: HttpsConfig = {
  enabled: process.env.NODE_ENV === 'production',
  trustProxy: true,
  hstsMaxAge: 63072000, // 2 years (recommended for preload)
  hstsIncludeSubDomains: true,
  hstsPreload: true,
  redirectCode: 308, // Permanent redirect, preserves method
};

/**
 * Checks if request is using HTTPS
 * @param request Fastify request
 * @param trustProxy Whether to trust X-Forwarded-Proto header
 * @returns true if HTTPS, false otherwise
 */
export function isHttps(request: FastifyRequest, trustProxy: boolean = true): boolean {
  // Check X-Forwarded-Proto header (reverse proxy)
  if (trustProxy) {
    const forwardedProto = request.headers['x-forwarded-proto'] as string;
    if (forwardedProto) {
      return forwardedProto.toLowerCase() === 'https';
    }
  }

  // Check direct protocol
  return request.protocol === 'https';
}

/**
 * Enforces HTTPS by redirecting HTTP requests
 * @param config HTTPS configuration
 */
export function enforceHttps(config: HttpsConfig = DEFAULT_HTTPS_CONFIG) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.enabled) {
      return; // Skip in development
    }

    if (!isHttps(request, config.trustProxy)) {
      const host = request.headers.host;
      if (!host) {
        reply.code(400);
        return reply.send({ error: 'Missing Host header' });
      }

      const redirectUrl = `https://${host}${request.url}`;
      reply.code(config.redirectCode);
      reply.header('Location', redirectUrl);
      return reply.send();
    }
  };
}

/**
 * Generates HSTS header value
 * @param config HTTPS configuration
 * @returns HSTS header value
 */
export function generateHstsHeader(config: HttpsConfig = DEFAULT_HTTPS_CONFIG): string {
  const parts = [`max-age=${config.hstsMaxAge}`];
  
  if (config.hstsIncludeSubDomains) {
    parts.push('includeSubDomains');
  }
  
  if (config.hstsPreload) {
    parts.push('preload');
  }
  
  return parts.join('; ');
}

/**
 * Validates security headers on response
 * @param headers Response headers
 * @returns Validation results
 */
export interface SecurityHeaderValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSecurityHeaders(headers: Record<string, string | string[] | undefined>): SecurityHeaderValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check HSTS
  const hsts = headers['strict-transport-security'];
  if (!hsts) {
    errors.push('Missing Strict-Transport-Security header');
  } else {
    const hstsValue = Array.isArray(hsts) ? hsts[0] : hsts;
    if (!hstsValue.includes('max-age=')) {
      errors.push('HSTS header missing max-age directive');
    }
    const maxAge = parseInt(hstsValue.match(/max-age=(\d+)/)?.[1] || '0');
    if (maxAge < 31536000) {
      warnings.push(`HSTS max-age too short (${maxAge}s, recommended: 31536000s+)`);
    }
    if (!hstsValue.includes('includeSubDomains')) {
      warnings.push('HSTS header missing includeSubDomains');
    }
  }

  // Check X-Content-Type-Options
  const xcto = headers['x-content-type-options'];
  if (!xcto || (Array.isArray(xcto) ? xcto[0] : xcto) !== 'nosniff') {
    errors.push('Missing or invalid X-Content-Type-Options header');
  }

  // Check X-Frame-Options
  const xfo = headers['x-frame-options'];
  if (!xfo) {
    errors.push('Missing X-Frame-Options header');
  }

  // Check Content-Security-Policy
  const csp = headers['content-security-policy'];
  if (!csp) {
    errors.push('Missing Content-Security-Policy header');
  }

  // Check Referrer-Policy
  const rp = headers['referrer-policy'];
  if (!rp) {
    warnings.push('Missing Referrer-Policy header');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Logs security header validation results
 * @param url Request URL
 * @param validation Validation results
 */
export function logSecurityHeaderValidation(url: string, validation: SecurityHeaderValidation): void {
  if (!validation.valid) {
    console.error(`[Security] HTTPS validation failed for ${url}:`);
    validation.errors.forEach(error => console.error(`  ❌ ${error}`));
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`[Security] HTTPS warnings for ${url}:`);
    validation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
  }
}

/**
 * Test suite for HTTPS enforcement
 */
export interface HttpsTestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

export async function testHttpsEnforcement(baseUrl: string): Promise<HttpsTestResult[]> {
  const results: HttpsTestResult[] = [];

  // Test 1: HTTP redirects to HTTPS
  try {
    const httpUrl = baseUrl.replace('https://', 'http://');
    const response = await fetch(httpUrl, { redirect: 'manual' });
    
    const passed = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location');
    
    results.push({
      test: 'HTTP to HTTPS redirect',
      passed,
      message: passed 
        ? `✅ HTTP redirects to HTTPS (${response.status})` 
        : `❌ HTTP does not redirect (${response.status})`,
      details: { status: response.status, location },
    });
  } catch (error) {
    results.push({
      test: 'HTTP to HTTPS redirect',
      passed: false,
      message: `❌ Failed to test redirect: ${error}`,
    });
  }

  // Test 2: HTTPS has HSTS header
  try {
    const response = await fetch(baseUrl);
    const hsts = response.headers.get('strict-transport-security');
    
    const passed = !!hsts && hsts.includes('max-age=');
    
    results.push({
      test: 'HSTS header present',
      passed,
      message: passed 
        ? `✅ HSTS header present: ${hsts}` 
        : '❌ HSTS header missing',
      details: { hsts },
    });
  } catch (error) {
    results.push({
      test: 'HSTS header present',
      passed: false,
      message: `❌ Failed to test HSTS: ${error}`,
    });
  }

  // Test 3: Security headers present
  try {
    const response = await fetch(baseUrl);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    const validation = validateSecurityHeaders(headers);
    
    results.push({
      test: 'Security headers validation',
      passed: validation.valid,
      message: validation.valid 
        ? '✅ All security headers present' 
        : `❌ Security headers missing: ${validation.errors.join(', ')}`,
      details: validation,
    });
  } catch (error) {
    results.push({
      test: 'Security headers validation',
      passed: false,
      message: `❌ Failed to test headers: ${error}`,
    });
  }

  // Test 4: HSTS preload eligible
  try {
    const response = await fetch(baseUrl);
    const hsts = response.headers.get('strict-transport-security') || '';
    
    const hasMaxAge = hsts.includes('max-age=');
    const maxAge = parseInt(hsts.match(/max-age=(\d+)/)?.[1] || '0');
    const hasIncludeSubDomains = hsts.includes('includeSubDomains');
    const hasPreload = hsts.includes('preload');
    
    const passed = hasMaxAge && maxAge >= 31536000 && hasIncludeSubDomains && hasPreload;
    
    results.push({
      test: 'HSTS preload eligible',
      passed,
      message: passed 
        ? '✅ HSTS eligible for preload list' 
        : '❌ HSTS not preload eligible',
      details: { maxAge, hasIncludeSubDomains, hasPreload },
    });
  } catch (error) {
    results.push({
      test: 'HSTS preload eligible',
      passed: false,
      message: `❌ Failed to test preload: ${error}`,
    });
  }

  return results;
}

/**
 * Formats test results for console output
 * @param results Test results
 * @returns Formatted string
 */
export function formatTestResults(results: HttpsTestResult[]): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════',
    '   HTTPS ENFORCEMENT TEST RESULTS',
    '═══════════════════════════════════════',
    '',
  ];

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.test}`);
    lines.push(`   ${result.message}`);
    if (result.details) {
      lines.push(`   Details: ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n   ')}`);
    }
    lines.push('');
  });

  lines.push('───────────────────────────────────────');
  lines.push(`Summary: ${passed}/${total} tests passed`);
  lines.push('═══════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}
