export interface VaultBridgeContext {
  schema_version?: number;
  source?: string;
  created_at?: string;
  vault_id?: string | null;
  vault_number?: number | null;
  vault_name?: string | null;
  psnx_path?: string | null;
  psnx_hash?: string | null;
  blend_path?: string | null;
  cipher_hint?: {
    entry_route?: string;
    entry_method?: string;
  } | null;
}

export interface VaultBridgeResult {
  ok: boolean;
  path?: string;
  context?: VaultBridgeContext;
  error?: string;
}

export async function readVaultBridgeContext(): Promise<VaultBridgeResult> {
  if (!window.electron?.getVaultBridgeContext) {
    return {
      ok: false,
      error: 'Eidolon vault detection is available only in the desktop Cipher app.',
    };
  }

  const result = await window.electron.getVaultBridgeContext();
  if (!result?.ok || !result.context) {
    return {
      ok: false,
      path: result?.path,
      error: result?.error || 'No current Eidolon vault context was found.',
    };
  }

  return {
    ok: true,
    path: result.path,
    context: result.context as VaultBridgeContext,
  };
}
