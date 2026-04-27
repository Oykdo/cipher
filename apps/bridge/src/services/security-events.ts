/**
 * Security events — in-memory ring buffer (privacy-l1)
 *
 * Replaces the audit_logs DB table dropped in migration 004. The privacy
 * contract (CIPHER_PRIVACY_GUARANTEES.md) forbids server-side persistent
 * tracking of authentication events: a queryable history of "who logged
 * in when" is itself a metadata leak, even with PII columns stripped.
 *
 * This module keeps a bounded, in-memory FIFO of recent security-relevant
 * events so an operator can investigate an active incident (a spam wave,
 * a brute-force attempt) without committing to long-term storage. The
 * buffer is wiped on every bridge restart by design — there is no
 * persistence layer.
 *
 * Capacity: configurable via `BRIDGE_SECURITY_EVENT_BUFFER_SIZE`
 * (default 10000, clamped 100..100000). When full, the oldest entries
 * roll off.
 *
 * What it stores:
 *   - timestamp (Unix ms)
 *   - userId (nullable — pre-auth events keep it null)
 *   - action label (e.g. "LOGIN_SRP_SUCCESS")
 *   - severity (INFO / WARNING / CRITICAL)
 *
 * What it deliberately does NOT store:
 *   - IP address
 *   - user-agent
 *   - request body / query / headers
 *   - any data derived from PII
 *
 * Legal posture: if law enforcement issues a subpoena, this ring buffer
 * holds at most a few hours of activity (depending on traffic and buffer
 * size) and contains no PII. Cipher can demonstrate the contract by
 * pointing at this code — same posture as Signal's well-publicized
 * "subpoena report".
 */

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface SecurityEvent {
    timestamp: number;
    userId: string | null;
    action: string;
    severity: Severity;
}

function clampInt(envValue: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = envValue ? Number.parseInt(envValue, 10) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

const CAPACITY = clampInt(
    process.env.BRIDGE_SECURITY_EVENT_BUFFER_SIZE,
    10_000,
    100,
    100_000
);

// Backed by a circular buffer rather than a growing array — O(1) push,
// no allocations once steady-state is reached.
const buffer: (SecurityEvent | null)[] = new Array(CAPACITY).fill(null);
let writeIndex = 0;
let totalRecorded = 0;

/**
 * Record a security-relevant event. Sync, never throws — used in the
 * happy path of auth routes so it must not block them.
 */
export function recordSecurityEvent(
    action: string,
    userId: string | null = null,
    severity: Severity = 'INFO'
): void {
    buffer[writeIndex] = {
        timestamp: Date.now(),
        userId,
        action,
        severity,
    };
    writeIndex = (writeIndex + 1) % CAPACITY;
    totalRecorded++;
}

/**
 * Snapshot of the buffer in chronological order (oldest → newest).
 * The buffer itself is left untouched.
 */
export function getRecentSecurityEvents(limit?: number): SecurityEvent[] {
    const events: SecurityEvent[] = [];
    // Walk from the slot AFTER the most recent write all the way around;
    // skip empty slots while the buffer is still being filled.
    const cap = buffer.length;
    for (let i = 0; i < cap; i++) {
        const idx = (writeIndex + i) % cap;
        const event = buffer[idx];
        if (event !== null) events.push(event);
    }
    if (limit !== undefined && limit < events.length) {
        return events.slice(events.length - limit);
    }
    return events;
}

export interface SecurityEventStats {
    capacity: number;
    held: number;
    totalRecordedSinceBoot: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    bySeverity: Record<Severity, number>;
    topActionsLast24h: Array<{ action: string; count: number }>;
    criticalLast24h: number;
}

/**
 * Aggregate counters over what is currently in the buffer. Cheap — runs
 * a single O(N) pass.
 */
export function getSecurityEventStats(): SecurityEventStats {
    const bySeverity: Record<Severity, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
    const actionCounts24h = new Map<string, number>();
    let oldest: number | null = null;
    let newest: number | null = null;
    let critical24h = 0;
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    let held = 0;
    for (const event of buffer) {
        if (event === null) continue;
        held++;
        bySeverity[event.severity]++;
        if (oldest === null || event.timestamp < oldest) oldest = event.timestamp;
        if (newest === null || event.timestamp > newest) newest = event.timestamp;
        if (event.timestamp >= cutoff24h) {
            actionCounts24h.set(event.action, (actionCounts24h.get(event.action) ?? 0) + 1);
            if (event.severity === 'CRITICAL') critical24h++;
        }
    }

    const topActionsLast24h = Array.from(actionCounts24h.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

    return {
        capacity: CAPACITY,
        held,
        totalRecordedSinceBoot: totalRecorded,
        oldestTimestamp: oldest,
        newestTimestamp: newest,
        bySeverity,
        topActionsLast24h,
        criticalLast24h: critical24h,
    };
}

/**
 * Wipe the ring buffer. Used by tests; not exposed to runtime callers.
 */
export function _resetSecurityEventBufferForTests(): void {
    for (let i = 0; i < buffer.length; i++) buffer[i] = null;
    writeIndex = 0;
    totalRecorded = 0;
}
