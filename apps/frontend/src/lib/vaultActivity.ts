const ACTIVITY_THROTTLE_MS = 24 * 60 * 60 * 1_000; // 24h — prevents resonance farming via repeated logins
const STORAGE_KEY = 'vault_activity_last_ping';

function getLastPing(vaultId: string): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const map = JSON.parse(stored) as Record<string, number>;
    return map[vaultId] ?? 0;
  } catch {
    return 0;
  }
}

function setLastPing(vaultId: string, ts: number): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, number> = stored ? JSON.parse(stored) : {};
    map[vaultId] = ts;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage unavailable
  }
}

export function pingVaultActivity(vaultId: string | undefined | null): void {
  if (!vaultId) return;

  const now = Date.now();
  const last = getLastPing(vaultId);
  if (now - last < ACTIVITY_THROTTLE_MS) return;
  setLastPing(vaultId, now);

  const connectUrl = import.meta.env.VITE_EIDOLON_CONNECT_URL || 'https://eidolon-connect.xyz';
  const url = `${connectUrl}/connect/vault/economy/${vaultId}/activity`;

  // no-cors: opaque response, no console errors on 429
  fetch(url, { method: 'POST', mode: 'no-cors' }).catch(() => {});
}
