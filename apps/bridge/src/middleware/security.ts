/**
 * Security Middleware
 * 
 * SECURITY: HTTP headers and CSP configuration
 * - Content Security Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * 
 * @module SecurityMiddleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  // Content Security Policy - Strict configuration
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),

  // HTTP Strict Transport Security - Force HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Prevent MIME sniffing
  'X-Content-Type-Options': 'nosniff',

  // XSS Protection (legacy, but still useful)
  'X-XSS-Protection': '1; mode=block',

  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions Policy (formerly Feature-Policy)
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
  ].join(', '),
};

/**
 * Apply security headers to response
 */
export async function securityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
    reply.header(header, value);
  });
}

/**
 * CORS configuration for cookies
 */
export const CORS_CONFIG = {
  origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.FRONTEND_URL?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000',
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow all localhost
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
};

/**
 * Cookie options for secure cookies
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Access token cookie options (shorter expiry)
 */
export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

/**
 * Refresh token cookie options (longer expiry)
 */
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT_CONFIG = {
  global: {
    max: 100,
    timeWindow: '1 minute',
  },
  auth: {
    max: 5,
    timeWindow: '15 minutes',
  },
  api: {
    max: 60,
    timeWindow: '1 minute',
  },
};
