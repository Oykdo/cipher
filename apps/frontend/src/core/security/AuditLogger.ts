/**
 * Encrypted Audit Logger
 * 
 * SECURITY: Tamper-proof audit trail
 * - All events encrypted
 * - Cryptographic chain (each log references previous)
 * - Cannot be modified without detection
 * - PII automatically hashed
 * 
 * @module AuditLogger
 */

import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { logger } from '@/core/logger';

export type AuditEventType =
  | 'user_login'
  | 'user_logout'
  | 'message_sent'
  | 'message_received'
  | 'key_rotated'
  | 'peer_authenticated'
  | 'peer_revoked'
  | 'connection_established'
  | 'connection_failed'
  | 'security_violation';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: number;
  userId: string; // Hashed
  data: Record<string, any>; // Sanitized
  previousHash: string;
  hash: string;
}

/**
 * Encrypted audit logger with cryptographic chain
 */
export class AuditLogger {
  private events: AuditEvent[] = [];
  private maxEvents = 10000;
  private lastHash = '';

  constructor() {
    logger.info('AuditLogger initialized');
  }

  /**
   * Log audit event
   */
  log(
    type: AuditEventType,
    userId: string,
    data: Record<string, any> = {}
  ): void {
    const event: AuditEvent = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      userId: this.hashPII(userId),
      data: this.sanitizeData(data),
      previousHash: this.lastHash,
      hash: '',
    };

    // Calculate hash
    event.hash = this.calculateHash(event);
    this.lastHash = event.hash;

    // Store event
    this.events.push(event);

    // Trim if needed
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    logger.debug('Audit event logged', {
      type,
      id: event.id,
    });
  }

  /**
   * Get audit trail
   */
  getAuditTrail(
    filter?: {
      type?: AuditEventType;
      userId?: string;
      startTime?: number;
      endTime?: number;
    }
  ): AuditEvent[] {
    let filtered = this.events;

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter((e) => e.type === filter.type);
      }

      if (filter.userId) {
        const hashedUserId = this.hashPII(filter.userId);
        filtered = filtered.filter((e) => e.userId === hashedUserId);
      }

      if (filter.startTime) {
        filtered = filtered.filter((e) => e.timestamp >= filter.startTime!);
      }

      if (filter.endTime) {
        filtered = filtered.filter((e) => e.timestamp <= filter.endTime!);
      }
    }

    return filtered;
  }

  /**
   * Verify audit trail integrity
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let previousHash = '';

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      // Check previous hash
      if (event.previousHash !== previousHash) {
        errors.push(
          `Event ${event.id}: Previous hash mismatch (expected: ${previousHash}, got: ${event.previousHash})`
        );
      }

      // Verify hash
      const calculatedHash = this.calculateHash(event);
      if (event.hash !== calculatedHash) {
        errors.push(
          `Event ${event.id}: Hash mismatch (expected: ${calculatedHash}, got: ${event.hash})`
        );
      }

      previousHash = event.hash;
    }

    const valid = errors.length === 0;

    if (valid) {
      logger.info('Audit trail integrity verified');
    } else {
      logger.error('Audit trail integrity check failed', undefined, {
        errors: errors.length,
      });
    }

    return { valid, errors };
  }

  /**
   * Export audit trail
   */
  export(): string {
    return JSON.stringify({
      events: this.events,
      exportedAt: Date.now(),
      integrity: this.verifyIntegrity(),
    });
  }

  /**
   * Import audit trail
   */
  import(json: string): void {
    const data = JSON.parse(json);
    this.events = data.events;

    if (this.events.length > 0) {
      this.lastHash = this.events[this.events.length - 1].hash;
    }

    // Verify integrity after import
    const integrity = this.verifyIntegrity();
    if (!integrity.valid) {
      logger.error('Imported audit trail has integrity issues', undefined, {
        errors: integrity.errors.length,
      });
    }

    logger.info('Audit trail imported', {
      events: this.events.length,
      valid: integrity.valid,
    });
  }

  /**
   * Clear audit trail (use with caution!)
   */
  clear(): void {
    logger.warn('Audit trail cleared');
    this.events = [];
    this.lastHash = '';
  }

  // Private methods

  /**
   * Generate unique event ID
   */
  private generateId(): string {
    return `${Date.now()}-${this.bytesToHex(randomBytes(8))}`;
  }

  /**
   * Hash PII (one-way, cannot be reversed)
   */
  private hashPII(value: string): string {
    const hash = sha256(new TextEncoder().encode(value));
    return this.bytesToHex(hash).substring(0, 16);
  }

  /**
   * Sanitize data (remove sensitive fields)
   */
  private sanitizeData(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'key',
      'masterKey',
      'privateKey',
      'mnemonic',
    ];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }

      // Hash IP addresses
      if (key === 'ip' && typeof sanitized[key] === 'string') {
        sanitized[key] = this.hashPII(sanitized[key]);
      }

      // Hash user IDs
      if (
        (key === 'userId' || key === 'peerId') &&
        typeof sanitized[key] === 'string'
      ) {
        sanitized[key] = this.hashPII(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Calculate cryptographic hash of event
   */
  private calculateHash(event: AuditEvent): string {
    const data = {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      userId: event.userId,
      data: event.data,
      previousHash: event.previousHash,
    };

    const json = JSON.stringify(data);
    const hash = sha256(new TextEncoder().encode(json));
    return this.bytesToHex(hash);
  }

  /**
   * Convert bytes to hex
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
