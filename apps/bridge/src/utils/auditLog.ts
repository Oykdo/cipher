import { randomUUID } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

/**
 * Helper function to log authentication actions
 * Creates an audit log entry for authentication-related events
 */
export async function logAuthAction(
  userId: string | null,
  action: string,
  request: FastifyRequest,
  severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO'
) {
  await db.createAuditLog({
    id: randomUUID(),
    user_id: userId,
    action,
    table_name: 'auth',
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
    severity,
  });
}
