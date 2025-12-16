/**
 * CSRF Protection Middleware
 * 
 * SECURITY FIX VUL-010: Implements CSRF protection for state-changing routes
 * 
 * Protection Strategy:
 * 1. Double-Submit Cookie Pattern (CSRF token in header must match cookie)
 * 2. SameSite=Strict cookies
 * 3. Origin/Referer validation
 * 
 * For JWT-only APIs, the protection comes from:
 * - JWT tokens are not automatically sent (unlike cookies)
 * - Origin header validation
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHmac } from 'crypto';
import { config } from '../config.js';

const CSRF_COOKIE_NAME = 'dd_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generates a new CSRF token
 */
function generateCsrfToken(): string {
    return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Signs a CSRF token with the JWT secret
 */
function signToken(token: string): string {
    const hmac = createHmac('sha256', config.security.jwtSecret!);
    hmac.update(token);
    return `${token}.${hmac.digest('hex').substring(0, 16)}`;
}

/**
 * Verifies a signed CSRF token
 */
function verifySignedToken(signedToken: string): boolean {
    const parts = signedToken.split('.');
    if (parts.length !== 2) return false;

    const [token, signature] = parts;
    const expectedSignature = signToken(token).split('.')[1];

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) return false;
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
        result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
}

/**
 * CSRF Protection Hook for Fastify
 * 
 * Validates CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)
 */
export function csrfProtection() {
    return async function (request: FastifyRequest, reply: FastifyReply) {
        // Only check state-changing methods
        const method = request.method.toUpperCase();
        if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            return;
        }

        // Exclude public auth routes from CSRF protection
        const EXCLUDED_PATHS = [
            '/api/v2/auth/signup',
            '/api/v2/auth/login',
            '/api/v2/auth/login-dicekey',
            '/api/v2/auth/login-with-avatar',
            '/api/v2/auth/srp/login/init',
            '/api/v2/auth/srp/login/verify',
            '/api/v2/auth/srp-seed/login/init',
            '/api/v2/auth/srp-seed/login/verify',
            '/api/v2/auth/refresh',
            '/api/public/stripe/create-checkout-session',
            '/api/public/stripe/webhook',
            '/api/generate-dicekey-avatar' // Part of signup flow, no JWT yet
        ];

        // Check if path is in excluded list (robust check for query params)
        const isExcluded = EXCLUDED_PATHS.some(path => request.url.startsWith(path));

        if (isExcluded) {
            return;
        }

        // Skip CSRF check for API routes that use JWT (token in Authorization header)
        // JWT tokens are not automatically sent by the browser, so they are inherently CSRF-safe
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            // Additional protection: validate Origin header
            const origin = request.headers.origin;
            const referer = request.headers.referer;

            // In production, require valid origin
            if (config.isProd) {
                const validOrigin = origin && config.security.allowedOrigins.includes(origin);
                const validReferer = referer && config.security.allowedOrigins.some(o => referer.startsWith(o));

                if (!validOrigin && !validReferer) {
                    request.log.warn({
                        origin,
                        referer,
                        method,
                        url: request.url,
                    }, 'CSRF: Origin/Referer validation failed');

                    reply.code(403);
                    return { error: 'Invalid origin', code: 'CSRF_ORIGIN_INVALID' };
                }
            }

            return; // JWT request is valid
        }

        // For non-JWT requests (if any), use double-submit cookie pattern
        const cookieHeader = request.headers.cookie || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [key, ...valueParts] = c.trim().split('=');
                return [key, valueParts.join('=')];
            })
        );

        const csrfCookie = cookies[CSRF_COOKIE_NAME];
        const csrfHeader = request.headers[CSRF_HEADER_NAME] as string;

        if (!csrfCookie || !csrfHeader) {
            request.log.warn({
                hasToken: !!csrfCookie,
                hasHeader: !!csrfHeader,
                method,
                url: request.url,
            }, 'CSRF: Missing token or header');

            reply.code(403);
            return { error: 'CSRF token required', code: 'CSRF_TOKEN_MISSING' };
        }

        // Verify token signature
        if (!verifySignedToken(csrfCookie)) {
            request.log.warn({ method, url: request.url }, 'CSRF: Invalid token signature');
            reply.code(403);
            return { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' };
        }

        // Verify header matches cookie (double-submit)
        if (csrfCookie !== csrfHeader) {
            request.log.warn({ method, url: request.url }, 'CSRF: Token mismatch');
            reply.code(403);
            return { error: 'CSRF token mismatch', code: 'CSRF_TOKEN_MISMATCH' };
        }
    };
}

/**
 * Route to get a CSRF token (for non-JWT auth flows)
 */
export async function csrfTokenRoute(request: FastifyRequest, reply: FastifyReply) {
    const token = generateCsrfToken();
    const signedToken = signToken(token);

    // Set cookie with secure flags
    reply.header('Set-Cookie', [
        `${CSRF_COOKIE_NAME}=${signedToken}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        config.isProd ? 'Secure' : '',
        `Max-Age=${60 * 60}`, // 1 hour
    ].filter(Boolean).join('; '));

    return { csrfToken: signedToken };
}

/**
 * Security headers for CSRF protection
 */
export function addSecurityHeaders() {
    return async function (request: FastifyRequest, reply: FastifyReply) {
        // X-Content-Type-Options: Prevent MIME sniffing
        reply.header('X-Content-Type-Options', 'nosniff');

        // X-Frame-Options: Prevent clickjacking
        reply.header('X-Frame-Options', 'DENY');

        // Referrer-Policy: Control referer information
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Permissions-Policy: Disable unnecessary browser features
        reply.header('Permissions-Policy', [
            'geolocation=()',
            'microphone=()',
            'camera=()',
            'payment=()',
            'usb=()',
        ].join(', '));
    };
}
