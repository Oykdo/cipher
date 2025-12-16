const LOCAL_STORAGE_PREFIX = 'cipherpulse:backupExportPassword:';

function normalizeUsername(username: string): string {
  return String(username || '').trim().toLowerCase();
}

function storageKey(username: string): string {
  return `${LOCAL_STORAGE_PREFIX}${normalizeUsername(username)}`;
}

export async function hasBackupExportPassword(username: string): Promise<boolean> {
  const key = normalizeUsername(username);
  if (!key) return false;

  if (window.electron?.backupPassword?.has) {
    return window.electron.backupPassword.has(key);
  }

  return Boolean(localStorage.getItem(storageKey(key)));
}

export async function getBackupExportPassword(username: string): Promise<string | null> {
  const key = normalizeUsername(username);
  if (!key) return null;

  if (window.electron?.backupPassword?.get) {
    const result = await window.electron.backupPassword.get(key);
    return result?.exists ? result.password ?? null : null;
  }

  return localStorage.getItem(storageKey(key));
}

export async function setBackupExportPassword(username: string, password: string): Promise<void> {
  const key = normalizeUsername(username);
  if (!key) throw new Error('Missing username');
  if (!password) throw new Error('Missing password');

  if (window.electron?.backupPassword?.set) {
    await window.electron.backupPassword.set(key, password);
    return;
  }

  localStorage.setItem(storageKey(key), password);
}

export async function clearBackupExportPassword(username: string): Promise<void> {
  const key = normalizeUsername(username);
  if (!key) return;

  if (window.electron?.backupPassword?.clear) {
    await window.electron.backupPassword.clear(key);
    return;
  }

  localStorage.removeItem(storageKey(key));
}
