export {};

type EidolonDesktopResult = {
  ok: boolean;
  status?:
    | 'launched'
    | 'install_required'
    | 'installer_opened'
    | 'download_opened';
  path?: string;
  mode?: string;
  error?: string;
  installerPath?: string;
  downloadUrl?: string;
  infoUrl?: string;
};

type EidolonVaultMetricsResult = {
  ok: boolean;
  error?: string;
  metrics?: {
    vaultId?: string;
    vaultNumber?: number;
    vaultName?: string;
    rawEntropyBits?: number | null;
    sourceEntropyBits?: number | null;
    holographicComplexityBits?: number | null;
    resonanceScore?: number | null;
    operationalEntropy?: number | null;
    eidolonBalance?: number | null;
    holographicDepthLevel?: number | null;
    pioneerTier?: string | null;
    lifetimeEidolonEarned?: number | null;
    lifetimeEidolonSpent?: number | null;
    /** Real crypto fingerprints read from blend_data.crypto_properties. */
    spinorSignature?: string | null;
    bellMax?: number | null;
    bellViolations?: number | null;
    bellIsQuantum?: boolean | null;
    /** Temporal drift (eons) — computed client-side from createdAt for live updates. */
    prismEpoch?: number | null;
    createdAt?: string | null;
  };
};

type SelectPsnxResult =
  | { ok: true; psnxPath: string; psnxHash: string }
  | { ok: false; error: string };

declare global {
  interface Window {
    electron?: {
      getAppPath?: () => Promise<string>;
      openEidolonLauncher?: () => Promise<EidolonDesktopResult>;
      openEidolonInstaller?: () => Promise<EidolonDesktopResult>;
      getEidolonVaultMetrics?: (
        vaultRef: { vaultId?: string; vaultNumber?: number | null }
      ) => Promise<EidolonVaultMetricsResult>;
      selectPsnxFile?: () => Promise<SelectPsnxResult>;
      probeEidolonConnect?: (payload: {
        baseUrl?: string;
        appId?: string;
      }) => Promise<{
        ok: boolean;
        baseUrl?: string;
        capabilities?: Record<string, unknown>;
        registration?: Record<string, unknown>;
        error?: string;
      }>;
      createEidolonConnectSession?: (payload: {
        baseUrl?: string;
        appId?: string;
        vaultId: string;
        vaultNumber?: number | null;
        vaultName?: string | null;
        source?: string;
        createdAt?: string;
      }) => Promise<{
        ok: boolean;
        baseUrl?: string;
        session?: Record<string, unknown>;
        error?: string;
      }>;
      getVaultBridgeContext?: () => Promise<{ ok: boolean; path?: string; context?: Record<string, unknown>; error?: string }>;
      backupPassword?: {
        has: (username: string) => Promise<boolean>;
        get: (username: string) => Promise<{ exists: boolean; password?: string; error?: string }>;
        set: (username: string, password: string) => Promise<{ ok: boolean }>;
        clear: (username: string) => Promise<{ ok: boolean }>;
      };
      storedBundle?: {
        save: (
          vaultId: string,
          vaultName: string,
          bytes: Uint8Array,
        ) => Promise<{ ok: boolean; error?: string }>;
        load: (
          vaultId: string,
        ) => Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }>;
        list: () => Promise<{
          ok: boolean;
          entries?: Array<{ vaultId: string; vaultName: string; savedAt: string }>;
          error?: string;
        }>;
        delete: (vaultId: string) => Promise<{ ok: boolean; error?: string }>;
      };
      tray?: {
        getPref: () => Promise<{ minimizeToTray: boolean; firstCloseShown: boolean; locale: string }>;
        setPref: (patch: { minimizeToTray?: boolean }) => Promise<{ minimizeToTray: boolean; firstCloseShown: boolean; locale: string }>;
        setLocale: (locale: string) => Promise<string>;
        quitNow: () => Promise<void>;
      };
      platform?: string;
      versions?: {
        node: string;
        chrome: string;
        electron: string;
      };
    };
  }
}
