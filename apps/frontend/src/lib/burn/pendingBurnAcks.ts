export type PendingBurnAck = {
  messageId: string;
  conversationId: string;
  revealedAt: number;
};

const STORAGE_PREFIX = 'bar:pendingAcks:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadPendingBurnAcks(userId: string): PendingBurnAck[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) =>
      e &&
      typeof e.messageId === 'string' &&
      typeof e.conversationId === 'string' &&
      typeof e.revealedAt === 'number'
    );
  } catch {
    return [];
  }
}

function savePendingBurnAcks(userId: string, entries: PendingBurnAck[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(entries));
}

export function upsertPendingBurnAck(userId: string, entry: PendingBurnAck): void {
  const entries = loadPendingBurnAcks(userId);
  const next = entries.filter((e) => e.messageId !== entry.messageId);
  next.push(entry);
  savePendingBurnAcks(userId, next);
}

export function removePendingBurnAck(userId: string, messageId: string): void {
  const entries = loadPendingBurnAcks(userId);
  const next = entries.filter((e) => e.messageId !== messageId);
  savePendingBurnAcks(userId, next);
}

export function clearPendingBurnAcks(userId: string): void {
  localStorage.removeItem(storageKey(userId));
}
