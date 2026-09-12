/**
 * Single access point for the end-of-ceremony vault file handover
 * (`vault-files:*` IPC). Same shape as lib/vaultBridge.ts.
 *
 * The renderer never sees a path: it names a file *kind*, the main process
 * resolves the source from the bridge context / Eidolon registry, and the
 * destination comes from a native dialog. Results carry only filename, size
 * and sha256 — never contents, never an absolute path. Outside Electron every
 * call resolves to `{ ok: false, error: 'unavailable' }`.
 */

export type VaultFileKind = 'psnx' | 'blend' | 'keybundle';

export interface VaultFileInfo {
  kind: VaultFileKind;
  filename: string;
  size: number;
  sha256: string;
}

export type VaultFileSkipReason = 'exists' | 'missing' | 'copy_failed';

export interface VaultFileSkipped {
  kind: VaultFileKind;
  filename: string;
  reason: VaultFileSkipReason;
}

export type VaultFilesListResult =
  | { ok: true; files: VaultFileInfo[] }
  | { ok: false; files: VaultFileInfo[]; error: string };

export type SaveVaultCopiesResult =
  | { ok: true; saved: VaultFileInfo[]; skipped: VaultFileSkipped[] }
  | { ok: false; saved: VaultFileInfo[]; skipped: VaultFileSkipped[]; error: string };

export type SaveVaultKeybundleResult =
  | { ok: true; filename: string; size: number; sha256: string }
  | { ok: false; error: string };

export type RevealVaultFilesResult = { ok: true } | { ok: false; error: string };

/** Error code returned when the IPC surface is not exposed (browser dev). */
export const VAULT_FILES_UNAVAILABLE = 'unavailable';

function vaultFilesApi() {
  return window.electron?.vaultFiles;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function isVaultFilesAvailable(): boolean {
  return Boolean(vaultFilesApi());
}

export async function listVaultFiles(): Promise<VaultFilesListResult> {
  const api = vaultFilesApi();
  if (!api) return { ok: false, files: [], error: VAULT_FILES_UNAVAILABLE };
  try {
    const result = await api.list();
    if (!result?.ok) {
      return { ok: false, files: [], error: result?.error || 'list_failed' };
    }
    return { ok: true, files: Array.isArray(result.files) ? result.files : [] };
  } catch (err) {
    return { ok: false, files: [], error: errorText(err, 'list_failed') };
  }
}

export async function saveVaultFileCopies(kinds: VaultFileKind[]): Promise<SaveVaultCopiesResult> {
  const api = vaultFilesApi();
  if (!api) return { ok: false, saved: [], skipped: [], error: VAULT_FILES_UNAVAILABLE };
  try {
    const result = await api.saveCopies(kinds);
    const saved = Array.isArray(result?.saved) ? result.saved : [];
    const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
    if (!result?.ok) {
      return { ok: false, saved, skipped, error: result?.error || 'save_failed' };
    }
    return { ok: true, saved, skipped };
  } catch (err) {
    return { ok: false, saved: [], skipped: [], error: errorText(err, 'save_failed') };
  }
}

export async function saveVaultKeybundle(vaultId: string): Promise<SaveVaultKeybundleResult> {
  const api = vaultFilesApi();
  if (!api) return { ok: false, error: VAULT_FILES_UNAVAILABLE };
  try {
    const result = await api.saveKeybundle(vaultId);
    if (!result?.ok) {
      return { ok: false, error: result?.error || 'save_failed' };
    }
    return {
      ok: true,
      filename: String(result.filename ?? ''),
      size: Number(result.size ?? 0),
      sha256: String(result.sha256 ?? ''),
    };
  } catch (err) {
    return { ok: false, error: errorText(err, 'save_failed') };
  }
}

export async function revealVaultFiles(): Promise<RevealVaultFilesResult> {
  const api = vaultFilesApi();
  if (!api) return { ok: false, error: VAULT_FILES_UNAVAILABLE };
  try {
    const result = await api.reveal();
    if (!result?.ok) {
      return { ok: false, error: result?.error || 'reveal_failed' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorText(err, 'reveal_failed') };
  }
}
