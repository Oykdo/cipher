import {
  API_BASE_URL,
  EIDOLON_CONNECT_APP_ID,
  EIDOLON_CONNECT_BASE_URL,
  EIDOLON_CONNECT_ENABLED,
} from '../config';

const CONNECT_DISABLED_ERROR =
  'Eidolon Connect is not yet available. Enable VITE_EIDOLON_CONNECT_ENABLED when the ecosystem is released.';

export interface EidolonConnectCapabilities {
  schema_version: string;
  capabilities: string[];
  consent_required: boolean;
  app_scoped_keys: boolean;
  raw_vault_key_export: boolean;
}

export interface EidolonConnectRegistration {
  schema_version: string;
  app_id: string;
  requested_scopes: string[];
  granted_scopes: string[];
  consent_required: boolean;
  status: string;
}

export interface EidolonConnectProbeResult {
  ok: boolean;
  baseUrl: string;
  capabilities?: EidolonConnectCapabilities;
  registration?: EidolonConnectRegistration;
  error?: string;
}

export interface EidolonConnectSession {
  schema_version: string;
  session_id: string;
  app_id: string;
  vault_id: string;
  vault_number?: number | null;
  vault_name?: string | null;
  status: string;
  expires_at: string;
  source?: string;
}

const DEFAULT_CONNECT_SCOPES = ['auth', 'read_public_identity'];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '');
}

function buildCandidateBaseUrls(preferredBaseUrl: string): string[] {
  const normalizedPreferred = normalizeBaseUrl(preferredBaseUrl);
  const candidates = [
    normalizedPreferred,
    // Local fallbacks for development only
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ];

  return Array.from(new Set(candidates));
}

async function fetchConnectJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { detail?: string; error?: string }).detail ||
        (data as { error?: string }).error ||
        `HTTP ${response.status}`
    );
  }
  return data as T;
}

async function probeConnectAtBaseUrl(
  baseUrl: string,
  appId: string
): Promise<EidolonConnectProbeResult> {
  try {
    const capabilities = await fetchConnectJson<EidolonConnectCapabilities>(baseUrl, '/connect/capabilities');
    const registration = await fetchConnectJson<EidolonConnectRegistration>(baseUrl, '/connect/apps/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        app_name: 'Cipher Desktop',
        scopes: DEFAULT_CONNECT_SCOPES,
        display_origin: API_BASE_URL,
        redirect_uri: 'cipher://callback',
      }),
    });

    return {
      ok: true,
      baseUrl,
      capabilities,
      registration,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    const serverHint =
      baseUrl.includes(':8080')
        ? 'Le serveur detecte sur 8080 ressemble au serveur de registration. Eidolon Connect attend l API locale sur le port 8000.'
        : message;

    return {
      ok: false,
      baseUrl,
      error: serverHint,
    };
  }
}

export async function ensureEidolonConnectRegistration(
  appId: string = EIDOLON_CONNECT_APP_ID
): Promise<EidolonConnectProbeResult> {
  if (!EIDOLON_CONNECT_ENABLED) {
    return {
      ok: false,
      baseUrl: EIDOLON_CONNECT_BASE_URL,
      error: CONNECT_DISABLED_ERROR,
    };
  }

  if (window.electron?.probeEidolonConnect) {
    const result = await window.electron.probeEidolonConnect({
      baseUrl: EIDOLON_CONNECT_BASE_URL,
      appId,
    });
    if (result.ok) {
      return {
        ok: true,
        baseUrl: result.baseUrl || EIDOLON_CONNECT_BASE_URL,
        capabilities: result.capabilities as unknown as EidolonConnectCapabilities,
        registration: result.registration as unknown as EidolonConnectRegistration,
      };
    }

    console.error('[EidolonConnect] Registration probe failed', {
      baseUrl: result.baseUrl || EIDOLON_CONNECT_BASE_URL,
      appId,
      error: result.error || 'Unknown IPC probe error',
    });
    return {
      ok: false,
      baseUrl: result.baseUrl || EIDOLON_CONNECT_BASE_URL,
      error: result.error || 'Unable to reach Eidolon Connect.',
    };
  }

  const candidates = buildCandidateBaseUrls(EIDOLON_CONNECT_BASE_URL);
  let lastFailure: EidolonConnectProbeResult | null = null;

  for (const baseUrl of candidates) {
    const result = await probeConnectAtBaseUrl(baseUrl, appId);
    if (result.ok) {
      return result;
    }
    lastFailure = result;
  }

  console.error('[EidolonConnect] Registration probe failed', {
    baseUrl: EIDOLON_CONNECT_BASE_URL,
    appId,
    candidates,
    error: lastFailure?.error || 'Unable to reach Eidolon Connect.',
  });

  return {
    ok: false,
    baseUrl: lastFailure?.baseUrl || EIDOLON_CONNECT_BASE_URL,
    error: lastFailure?.error || 'Unable to reach Eidolon Connect.',
  }
}

export async function createEidolonConnectSession(input: {
  appId?: string;
  vaultId: string;
  vaultNumber?: number | null;
  vaultName?: string | null;
  source?: string;
  createdAt?: string;
}): Promise<{ ok: boolean; baseUrl: string; session?: EidolonConnectSession; error?: string }> {
  if (!EIDOLON_CONNECT_ENABLED) {
    return {
      ok: false,
      baseUrl: EIDOLON_CONNECT_BASE_URL,
      error: CONNECT_DISABLED_ERROR,
    };
  }

  const appId = input.appId || EIDOLON_CONNECT_APP_ID;

  if (window.electron?.createEidolonConnectSession) {
    const result = await window.electron.createEidolonConnectSession({
      baseUrl: EIDOLON_CONNECT_BASE_URL,
      appId,
      vaultId: input.vaultId,
      vaultNumber: input.vaultNumber,
      vaultName: input.vaultName,
      source: input.source,
      createdAt: input.createdAt,
    });

    if (result.ok && result.session) {
      return {
        ok: true,
        baseUrl: result.baseUrl || EIDOLON_CONNECT_BASE_URL,
        session: result.session as unknown as EidolonConnectSession,
      };
    }

    return {
      ok: false,
      baseUrl: result.baseUrl || EIDOLON_CONNECT_BASE_URL,
      error: result.error || 'Unable to create an Eidolon Connect session.',
    };
  }

  // Route session creation through the bridge backend (which holds the secret)
  try {
    const session = await fetchConnectJson<EidolonConnectSession>(API_BASE_URL, '/api/v2/auth/eidolon-connect/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        vault_id: input.vaultId,
        vault_number: input.vaultNumber,
        vault_name: input.vaultName,
        source: input.source,
        created_at: input.createdAt,
      }),
    });

    return {
      ok: true,
      baseUrl: API_BASE_URL,
      session,
    };
  } catch (error: any) {
    return {
      ok: false,
      baseUrl: API_BASE_URL,
      error: error?.message || 'Unable to create an Eidolon Connect session.',
    };
  }
}
