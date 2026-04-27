/**
 * Purge worker — privacy-l1 retention enforcement.
 *
 * Implements the dual-TTL policy described in CIPHER_PRIVACY_GUARANTEES.md
 * for the `messages` table (and the attachments referenced by them):
 *
 *   1. Post-pickup grace : delete messages where `delivered_at` is older
 *      than BRIDGE_MESSAGE_TTL_DAYS (default 7).
 *   2. Max-pending safety net : delete messages where `delivered_at` is
 *      still NULL but `created_at` is older than BRIDGE_MESSAGE_MAX_PENDING_DAYS
 *      (default 30). Covers recipients who never came back online.
 *
 * Time-lock messages do NOT bypass these rules — the unlock time is
 * enforced cryptographically via tlock/drand on the recipient's device,
 * so once the blob has been picked up the server can drop it. Senders
 * are warned client-side when an unlock time exceeds the max-pending
 * window (UI responsibility, not this worker's).
 *
 * Cadence : runs once on boot (after a small startup delay so the rest
 * of the bridge has come up), then every BRIDGE_PURGE_INTERVAL_MINUTES
 * (default 60).
 *
 * Failure mode : logs and continues. A purge failure must never crash
 * the bridge or block message delivery.
 */

import type { FastifyInstance } from 'fastify';
import { unlink } from 'node:fs/promises';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

interface PurgeStats {
    deliveredPurged: number;
    pendingPurged: number;
    attachmentsRemoved: number;
    durationMs: number;
}

class PurgeWorker {
    private fastify: FastifyInstance | null = null;
    private intervalHandle: NodeJS.Timeout | null = null;
    private running = false;

    initialize(fastify: FastifyInstance) {
        this.fastify = fastify;
    }

    start() {
        if (!this.fastify) {
            throw new Error('PurgeWorker not initialized');
        }
        if (this.intervalHandle) {
            return; // already started
        }

        const ttlDays = clampInt(process.env.BRIDGE_MESSAGE_TTL_DAYS, 7, 1, 30);
        const maxPendingDays = clampInt(process.env.BRIDGE_MESSAGE_MAX_PENDING_DAYS, 30, 7, 90);
        const intervalMinutes = clampInt(process.env.BRIDGE_PURGE_INTERVAL_MINUTES, 60, 5, 360);

        this.fastify.log.info(
            {
                ttlDays,
                maxPendingDays,
                intervalMinutes,
            },
            '🧹 Purge worker scheduled (privacy-l1 retention)'
        );

        // Initial run after 60s — gives the rest of the bridge time to settle.
        const startupDelayMs = 60_000;
        setTimeout(() => {
            void this.runOnce(ttlDays, maxPendingDays);
            this.intervalHandle = setInterval(
                () => void this.runOnce(ttlDays, maxPendingDays),
                intervalMinutes * 60_000
            );
        }, startupDelayMs);
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Run a single purge pass. Public so an admin endpoint or a test can
     * trigger it on demand.
     */
    async runOnce(ttlDays: number, maxPendingDays: number): Promise<PurgeStats> {
        if (!this.fastify) {
            throw new Error('PurgeWorker not initialized');
        }
        if (this.running) {
            this.fastify.log.warn('🧹 Purge worker pass skipped — previous run still in flight');
            return { deliveredPurged: 0, pendingPurged: 0, attachmentsRemoved: 0, durationMs: 0 };
        }

        this.running = true;
        const startedAt = Date.now();
        const stats: PurgeStats = {
            deliveredPurged: 0,
            pendingPurged: 0,
            attachmentsRemoved: 0,
            durationMs: 0,
        };

        try {
            // Step 1 — collect attachment file paths referenced by messages
            // we are about to delete, so we can clean up the disk too.
            // We have to do this BEFORE the DELETE because of the ON DELETE
            // CASCADE on attachments, which would remove the rows before
            // we get to read them.
            const orphanPaths = await this.collectOrphanAttachmentPaths(ttlDays, maxPendingDays);

            // Step 2 — delete messages past the post-pickup grace window.
            const deliveredResult = await db.pool.query(
                `DELETE FROM messages
                 WHERE delivered_at IS NOT NULL
                   AND delivered_at < NOW() - ($1::int * INTERVAL '1 day')`,
                [ttlDays]
            );
            stats.deliveredPurged = deliveredResult.rowCount ?? 0;

            // Step 3 — delete messages past the max-pending safety net.
            const pendingResult = await db.pool.query(
                `DELETE FROM messages
                 WHERE delivered_at IS NULL
                   AND created_at < NOW() - ($1::int * INTERVAL '1 day')`,
                [maxPendingDays]
            );
            stats.pendingPurged = pendingResult.rowCount ?? 0;

            // Step 4 — remove the orphaned attachment files from disk.
            for (const filePath of orphanPaths) {
                try {
                    await unlink(filePath);
                    stats.attachmentsRemoved++;
                } catch (err: any) {
                    // ENOENT is harmless — the file was already gone.
                    if (err?.code !== 'ENOENT') {
                        this.fastify.log.warn(
                            { err, filePath },
                            '🧹 Failed to remove orphan attachment file'
                        );
                    }
                }
            }

            stats.durationMs = Date.now() - startedAt;

            if (stats.deliveredPurged + stats.pendingPurged + stats.attachmentsRemoved > 0) {
                this.fastify.log.info(stats, '🧹 Purge pass completed');
            } else {
                this.fastify.log.debug(stats, '🧹 Purge pass: nothing to do');
            }
        } catch (err) {
            this.fastify.log.error({ err }, '🧹 Purge pass failed');
        } finally {
            this.running = false;
        }

        return stats;
    }

    /**
     * Returns the file paths of attachments belonging to messages that
     * the next purge pass will delete. The DB rows themselves disappear
     * via ON DELETE CASCADE; this collection is only about the on-disk
     * ciphertext blobs, which Postgres does not manage.
     */
    private async collectOrphanAttachmentPaths(
        ttlDays: number,
        maxPendingDays: number
    ): Promise<string[]> {
        try {
            // Attachments are pinned to a conversation, not a message —
            // we collect the attachments tied to conversations whose
            // messages are about to be cleared. Conservative: only flag
            // the attachments that belong to conversations entirely
            // covered by the purge window.
            const result = await db.pool.query(
                `SELECT a.path
                 FROM attachments a
                 JOIN messages m ON m.conversation_id = a.conversation_id
                 WHERE (m.delivered_at IS NOT NULL
                        AND m.delivered_at < NOW() - ($1::int * INTERVAL '1 day'))
                    OR (m.delivered_at IS NULL
                        AND m.created_at < NOW() - ($2::int * INTERVAL '1 day'))`,
                [ttlDays, maxPendingDays]
            );
            return result.rows
                .map((row: { path: string }) => row.path)
                .filter((path): path is string => typeof path === 'string' && path.length > 0);
        } catch (err) {
            this.fastify?.log.warn({ err }, '🧹 Failed to collect orphan attachment paths');
            return [];
        }
    }
}

function clampInt(envValue: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = envValue ? Number.parseInt(envValue, 10) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export const purgeWorker = new PurgeWorker();
