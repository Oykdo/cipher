/**
 * Client for the /api/v2/vault/keybundle/* routes.
 *
 * Export produces a binary `.eidolon_keybundle` download. Import uploads one
 * via multipart and returns the freshly-registered vault info (used to
 * auto-login post-import).
 */

export type ExportResult = {
  ok: true;
  filename: string;
  size: number;
  vaultId: string;
  vaultName: string;
  sha256: string;
};

export type ImportResult = {
  ok: true;
  reusedExisting?: boolean;
  vaultId: string;
  vaultNumber: number;
  vaultName: string;
  psnxPath: string;
  blendPath: string;
  bridgePath: string;
  message?: string;
};

export type KeybundleError = { ok: false; error: string; detail?: unknown };

/**
 * Fetch the bundle, trigger a browser download, return metadata. The browser
 * save dialog is spawned synchronously in the click handler's event loop so
 * popup blockers don't kick in.
 */
export async function exportVaultKeybundle(vaultId: string): Promise<ExportResult | KeybundleError> {
  const url = `/api/v2/vault/keybundle/export?vaultId=${encodeURIComponent(vaultId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { /* non-JSON error */ }
    return { ok: false, error: `export failed: HTTP ${res.status}`, detail };
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${vaultId}.eidolon_keybundle`;
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Slight delay before revoking so browsers that start the download async
  // don't truncate. 5 s is plenty even on slow disks.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

  return {
    ok: true,
    filename,
    size: blob.size,
    vaultId: res.headers.get('x-vault-id') ?? vaultId,
    vaultName: res.headers.get('x-vault-name') ?? '',
    sha256: res.headers.get('x-bundle-sha256') ?? '',
  };
}

export async function importVaultKeybundle(file: File | Blob): Promise<ImportResult | KeybundleError> {
  const form = new FormData();
  form.append('file', file, 'bundle.eidolon_keybundle');
  const res = await fetch('/api/v2/vault/keybundle/import', { method: 'POST', body: form });
  let payload: Record<string, unknown>;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: `import failed: HTTP ${res.status} (non-JSON body)` };
  }
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `import failed: HTTP ${res.status}`,
      detail: payload.detail ?? payload,
    };
  }
  return {
    ok: true,
    reusedExisting: payload.reused_existing === true,
    vaultId: String(payload.vault_id ?? ''),
    vaultNumber: Number(payload.vault_number ?? 0),
    vaultName: String(payload.vault_name ?? ''),
    psnxPath: String(payload.psnx_path ?? ''),
    blendPath: String(payload.blend_path ?? ''),
    bridgePath: String(payload.bridge_path ?? ''),
    message: typeof payload.message === 'string' ? payload.message : undefined,
  };
}
