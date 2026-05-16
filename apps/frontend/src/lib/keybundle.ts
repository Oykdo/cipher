/**
 * Client for the /api/v2/vault/keybundle/* routes.
 *
 * Export produces a binary `.eidolon_keybundle` download. Import uploads one
 * via multipart and returns the freshly-registered vault info (used to
 * auto-login post-import).
 *
 * Packaged Electron must not use relative `/api/...` URLs — they resolve to
 * `file:///C:/api/...`. When the bridge is remote (Fly), import/export run
 * locally via `window.electron` IPC + Eidolon's keybundle_cli.py.
 */

import { API_BASE_URL, API_SUPPORTS_LOCAL_PSNX } from '../config';

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

function apiV2Url(pathSuffix: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
  return `${base}${suffix}`;
}

async function blobToUint8Array(file: File | Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

type ElectronKeybundleImportResult =
  | ImportResult
  | KeybundleError
  | {
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

type ElectronKeybundleExportResult =
  | KeybundleError
  | {
      ok: true;
      bytes: Uint8Array;
      filename: string;
      vaultId: string;
      vaultName: string;
      sha256: string;
      size: number;
    };

/**
 * Fetch the bundle, trigger a browser download, return metadata. The browser
 * save dialog is spawned synchronously in the click handler's event loop so
 * popup blockers don't kick in.
 */
export async function exportVaultKeybundle(vaultId: string): Promise<ExportResult | KeybundleError> {
  if (window.electron?.exportVaultKeybundle && !API_SUPPORTS_LOCAL_PSNX) {
    const result = (await window.electron.exportVaultKeybundle(
      vaultId,
    )) as ElectronKeybundleExportResult;
    if (!result.ok) {
      return { ok: false, error: result.error, detail: result };
    }
    const blob = new Blob([result.bytes as BlobPart], {
      type: 'application/octet-stream',
    });
    triggerBrowserDownload(blob, result.filename);
    return {
      ok: true,
      filename: result.filename,
      size: result.size,
      vaultId: result.vaultId,
      vaultName: result.vaultName,
      sha256: result.sha256,
    };
  }

  const url = apiV2Url(
    `/api/v2/vault/keybundle/export?vaultId=${encodeURIComponent(vaultId)}`,
  );
  const res = await fetch(url);
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      /* non-JSON error */
    }
    return { ok: false, error: `export failed: HTTP ${res.status}`, detail };
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename =
    /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${vaultId}.eidolon_keybundle`;
  const blob = await res.blob();
  triggerBrowserDownload(blob, filename);

  return {
    ok: true,
    filename,
    size: blob.size,
    vaultId: res.headers.get('x-vault-id') ?? vaultId,
    vaultName: res.headers.get('x-vault-name') ?? '',
    sha256: res.headers.get('x-bundle-sha256') ?? '',
  };
}

export async function importVaultKeybundle(
  file: File | Blob,
): Promise<ImportResult | KeybundleError> {
  if (window.electron?.importVaultKeybundle && !API_SUPPORTS_LOCAL_PSNX) {
    const bytes = await blobToUint8Array(file);
    const result = (await window.electron.importVaultKeybundle(
      bytes,
    )) as ElectronKeybundleImportResult;
    if (!result.ok) {
      return {
        ok: false,
        error: 'error' in result ? result.error : 'import failed',
        detail: result,
      };
    }
    return {
      ok: true,
      reusedExisting: result.reusedExisting,
      vaultId: result.vaultId,
      vaultNumber: result.vaultNumber,
      vaultName: result.vaultName,
      psnxPath: result.psnxPath,
      blendPath: result.blendPath,
      bridgePath: result.bridgePath,
      message: result.message,
    };
  }

  const form = new FormData();
  form.append('file', file, 'bundle.eidolon_keybundle');
  const res = await fetch(apiV2Url('/api/v2/vault/keybundle/import'), {
    method: 'POST',
    body: form,
  });
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
