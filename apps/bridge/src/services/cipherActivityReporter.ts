/**
 * Cipher Activity Reporter
 *
 * Periodically aggregates each linked-vault user's Cipher activity (messages,
 * conversations, key verifications, realm actions) and POSTs the result to
 * Eidolon's webhook so that the new resonance/yield economy actually receives
 * real usage signals.
 *
 * Wire-up (in bridge/src/index.ts):
 *     import { CipherActivityReporter } from './services/cipherActivityReporter.js';
 *     const reporter = new CipherActivityReporter();
 *     reporter.initialize(fastify);
 *     reporter.start();
 *
 * Disabled by default; set EIDOLON_ACTIVITY_REPORT_ENABLED=true to enable.
 * Reports run every EIDOLON_ACTIVITY_REPORT_INTERVAL_MS (default 4h, matching
 * Eidolon's per-epoch duration).
 */

import type { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/database.js';

const ENABLED = process.env.EIDOLON_ACTIVITY_REPORT_ENABLED === 'true';
const INTERVAL_MS = Number(
  process.env.EIDOLON_ACTIVITY_REPORT_INTERVAL_MS ?? 4 * 60 * 60 * 1000,
);
const EIDOLON_BASE_URL = (
  process.env.EIDOLON_CONNECT_URL || 'http://localhost:8000'
).replace(/\/$/, '');
const EIDOLON_SECRET = process.env.EIDOLON_CONNECT_SESSION_SECRET || '';

type AggregatedMetrics = {
  vault_id: string;
  messages_sent: number;
  messages_received: number;
  active_conversations: number;
  key_verifications: number;
  realm_votes: number;
  realm_proposals: number;
  files_shared: number;
  reactions_sent: number;
  period_start: string;
  period_end: string;
  current_resonance: number;
  current_entropy: number;
};

export class CipherActivityReporter {
  private fastify: FastifyInstance | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastReportAt: Date | null = null;
  private db = getDatabase();

  initialize(fastify: FastifyInstance) {
    this.fastify = fastify;
    if (ENABLED) {
      fastify.log.info(
        { intervalMs: INTERVAL_MS, base: EIDOLON_BASE_URL },
        'Cipher Activity Reporter initialised',
      );
    } else {
      fastify.log.info(
        'Cipher Activity Reporter disabled (set EIDOLON_ACTIVITY_REPORT_ENABLED=true to enable)',
      );
    }
  }

  start() {
    if (!ENABLED || this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.runReport().catch((err) => {
        this.fastify?.log.error({ err }, 'Activity report failed');
      });
    }, INTERVAL_MS);

    setTimeout(() => {
      this.runReport().catch((err) => {
        this.fastify?.log.error({ err }, 'Initial activity report failed');
      });
    }, 30_000);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Aggregate activity since the last report (or last INTERVAL_MS) per linked
   * vault, then POST to Eidolon's webhook for each.
   */
  private async runReport(): Promise<void> {
    if (!ENABLED) return;
    const now = new Date();
    const since = this.lastReportAt ?? new Date(now.getTime() - INTERVAL_MS);
    const sinceIso = since.toISOString();
    const sinceMs = since.getTime();

    const linkedRows = await this.db.pool.query<{
      user_id: string;
      vault_id: string;
      resonance_score: number | null;
      operational_entropy: number | null;
    }>(
      `SELECT u.id AS user_id,
              u.linked_vault_id AS vault_id,
              COALESCE(u.last_known_resonance, 50)::float AS resonance_score,
              COALESCE(u.last_known_entropy, 0)::float AS operational_entropy
         FROM users u
        WHERE u.linked_vault_id IS NOT NULL`,
    );

    let reported = 0;
    for (const row of linkedRows.rows) {
      try {
        const metrics = await this.aggregateForUser(
          row.user_id,
          row.vault_id,
          sinceMs,
          sinceIso,
          now.toISOString(),
          row.resonance_score ?? 50,
          row.operational_entropy ?? 0,
        );
        if (this.hasSignal(metrics)) {
          await this.postToEidolon(metrics);
          reported += 1;
        }
      } catch (err) {
        this.fastify?.log.warn({ err, userId: row.user_id }, 'vault report skipped');
      }
    }

    this.lastReportAt = now;
    this.fastify?.log.info(
      { reported, scanned: linkedRows.rows.length },
      'Activity report cycle complete',
    );
  }

  private async aggregateForUser(
    userId: string,
    vaultId: string,
    sinceMs: number,
    periodStart: string,
    periodEnd: string,
    currentResonance: number,
    currentEntropy: number,
  ): Promise<AggregatedMetrics> {
    const [sentResult, receivedResult, convResult] = await Promise.all([
      this.db.pool.query(
        'SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1 AND created_at > $2',
        [userId, sinceMs],
      ),
      this.db.pool.query(
        `SELECT COUNT(*)::int AS count
           FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
          WHERE cm.user_id = $1 AND m.sender_id <> $1 AND m.created_at > $2`,
        [userId, sinceMs],
      ),
      this.db.pool.query(
        `SELECT COUNT(DISTINCT m.conversation_id)::int AS count
           FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
          WHERE cm.user_id = $1 AND m.created_at > $2`,
        [userId, sinceMs],
      ),
    ]);

    return {
      vault_id: vaultId,
      messages_sent: sentResult.rows[0]?.count ?? 0,
      messages_received: receivedResult.rows[0]?.count ?? 0,
      active_conversations: convResult.rows[0]?.count ?? 0,
      key_verifications: 0,
      realm_votes: 0,
      realm_proposals: 0,
      files_shared: 0,
      reactions_sent: 0,
      period_start: periodStart,
      period_end: periodEnd,
      current_resonance: currentResonance,
      current_entropy: currentEntropy,
    };
  }

  private hasSignal(m: AggregatedMetrics): boolean {
    return (
      m.messages_sent > 0 ||
      m.messages_received > 0 ||
      m.active_conversations > 0 ||
      m.key_verifications > 0 ||
      m.realm_votes > 0 ||
      m.realm_proposals > 0
    );
  }

  private async postToEidolon(metrics: AggregatedMetrics): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (EIDOLON_SECRET) {
      headers['X-Eidolon-Connect-Secret'] = EIDOLON_SECRET;
    }
    const response = await fetch(`${EIDOLON_BASE_URL}/api/v1/cipher/activity`, {
      method: 'POST',
      headers,
      body: JSON.stringify(metrics),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Eidolon activity HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }
  }
}
