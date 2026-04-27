import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDatabase } from '../db/database.js';
import { handleCspReport, getRecentViolations, getViolationStats } from '../middleware/cspNonce.js';
import * as psi from '../services/psi.js';
import { createRefreshToken } from '../utils/refreshToken.js';
import { logAuthAction } from '../utils/auditLog.js';
import {
  getRecentSecurityEvents,
  getSecurityEventStats,
} from '../services/security-events.js';

const db = getDatabase();

/**
 * Health, CSP, PSI, and Audit routes
 * Includes monitoring, security reporting, and privacy features
 */
export async function healthRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  fastify.get('/health', async () => {
    const stats = await db.getStats(); // ✅ Added await
    return { status: 'ok', database: stats };
  });

  // ============================================================================
  // CSP REPORTING & MONITORING
  // ============================================================================

  // CSP Violation Report Endpoint
  fastify.post('/api/csp-report', async (request, reply) => {
    return handleCspReport(request, reply);
  });

  // CSP Violations Dashboard (authenticated, admin only)
  fastify.get('/api/csp-violations', { preHandler: fastify.authenticate as any }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit) || 100;
    const violations = getRecentViolations(limit);
    return { violations, total: violations.length };
  });

  // CSP Statistics (authenticated, admin only)
  fastify.get('/api/csp-stats', { preHandler: fastify.authenticate as any }, async () => {
    return getViolationStats();
  });

  // ============================================================================
  // PSI ENHANCED (Private Set Intersection)
  // ============================================================================

  // PSI Contact Discovery
  fastify.get('/api/psi/contacts', { preHandler: fastify.authenticate as any }, async () => {
    return await psi.getPsiContactSetTracked();
  });

  // PSI Key Exchange
  fastify.post('/api/psi/key-exchange', { preHandler: fastify.authenticate as any }, async (request, reply) => {
    const body = request.body as psi.PsiKeyExchangeRequest;

    if (!body.clientPublicKey || !body.blindedIdentity) {
      reply.code(400);
      return { error: 'clientPublicKey et blindedIdentity requis' };
    }

    return psi.evaluateKeyExchangeTracked(body);
  });

  // PSI Zero-Knowledge Authentication
  fastify.post('/api/psi/zk-auth', async (request, reply) => {
    const body = request.body as psi.ZkAuthRequest;

    if (!body.commitment || !body.proof || !body.challenge) {
      reply.code(400);
      return { error: 'commitment, proof et challenge requis' };
    }

    const valid = await psi.verifyZkAuthTracked(body, body.commitment);

    if (!valid) {
      reply.code(401);
      return { error: 'Authentification ZK invalide' };
    }

    return { valid: true };
  });

  // PSI Enhanced Authentication (combines PSI with existing auth)
  fastify.post('/api/psi/auth', async (request, reply) => {
    const body = request.body as psi.PsiAuthRequest;

    if (!body.username || !body.blindedProof || !body.timestamp) {
      reply.code(400);
      return { error: 'username, blindedProof et timestamp requis' };
    }

    const valid = await psi.verifyPsiAuth(body);

    if (!valid) {
      reply.code(401);
      return { error: 'Authentification PSI invalide' };
    }

    // If PSI auth successful, return JWT token
    const user = await db.getUserByUsername(body.username);
    if (!user) {
      reply.code(404);
      return { error: 'Utilisateur introuvable' };
    }

    const token = await reply.jwtSign({ sub: user.id, tier: user.security_tier });
    const userAgent = request.headers['user-agent'];
    const ipAddress = request.ip;
    const { token: refreshToken } = await createRefreshToken(user.id, userAgent, ipAddress);

    // Log PSI authentication
    logAuthAction(user.id, 'PSI_AUTH', request, 'INFO');

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        securityTier: user.security_tier,
      },
    };
  });

  // PSI Statistics (admin only)
  fastify.get('/api/psi/stats', { preHandler: fastify.authenticate as any }, async () => {
    return psi.getPsiServerStats();
  });

  // ============================================================================
  // SECURITY EVENTS — in-memory ring buffer (privacy-l1)
  // ============================================================================
  //
  // The legacy /api/audit-logs and /api/audit-stats endpoints used to
  // serve a queryable persistent log. Migration 004 dropped the audit_logs
  // table; the ring buffer in services/security-events.ts replaces it for
  // active-incident debugging. The endpoints below preserve the same
  // names so existing admin tooling keeps working — but the data they
  // return is bounded, in-memory, lost on bridge restart, and PII-free.

  fastify.get('/api/audit-logs', { preHandler: fastify.authenticate as any }, async (request) => {
    const query = request.query as any;
    const limit = Math.min(Math.max(parseInt(query.limit) || 100, 1), 1000);
    const events = getRecentSecurityEvents(limit);
    return {
      logs: events,
      total: events.length,
      _note: 'In-memory ring buffer (privacy-l1) — not persisted across bridge restarts.',
    };
  });

  fastify.get('/api/audit-stats', { preHandler: fastify.authenticate as any }, async () => {
    return {
      ...getSecurityEventStats(),
      _note: 'In-memory ring buffer (privacy-l1) — counts reset on bridge restart.',
    };
  });
}
