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

/**
 * Genesis ceremony IPC. The ceremony mints the master seed and writes the
 * vault files locally, so it runs as a child process of the main process —
 * never against a remote endpoint. Event kinds mirror the SSE contract of
 * apps/bridge/src/routes/genesis.ts.
 */
type GenesisStartResult =
  | { ok: true; runId: string }
  | { ok: false; error: string; message?: string };

type GenesisStreamEvent = {
  runId: string;
  event: 'hello' | 'phase' | 'log' | 'done' | 'error';
  data: Record<string, unknown>;
};

type SelectPsnxResult =
  | { ok: true; psnxPath: string; psnxHash: string }
  | { ok: false; error: string };

type ReadPsnxResult =
  | { ok: true; base64: string; hash: string }
  | { ok: false; error: string };

/**
 * End-of-ceremony vault file handover (`vault-files:*`). The renderer only
 * ever names a file kind; every source path is resolved in the main process
 * and every destination comes from a native dialog. No result carries an
 * absolute path or file contents — only filename, size and sha256.
 */
type VaultFileKind = 'psnx' | 'blend' | 'keybundle';

type VaultFileInfo = {
  kind: VaultFileKind;
  filename: string;
  size: number;
  sha256: string;
};

type VaultFileSkipped = {
  kind: VaultFileKind;
  filename: string;
  reason: 'exists' | 'missing' | 'copy_failed';
};

type VaultFilesListResult =
  | { ok: true; files: VaultFileInfo[] }
  | { ok: false; files: VaultFileInfo[]; error: string };

type VaultFilesSaveCopiesResult =
  | { ok: true; saved: VaultFileInfo[]; skipped?: VaultFileSkipped[] }
  | { ok: false; saved: VaultFileInfo[]; skipped?: VaultFileSkipped[]; error: string };

type VaultFilesSaveKeybundleResult =
  | { ok: true; filename: string; size: number; sha256: string }
  | { ok: false; error: string };

type VaultFilesRevealResult = { ok: true } | { ok: false; error: string };

/**
 * Vault → E2EE root (`vault-e2ee:derive-seed`, contract v1). The renderer
 * names a vault id; main resolves the .psnx and runs the Eidolon runtime.
 * `masterKeyHex` is the account's E2EE root: consumed once, never logged.
 */
type VaultE2EESeedResult =
  | { ok: true; keyId: string; vaultId: string; masterKeyHex: string }
  | { ok: false; error: string; errorCode?: string };

/**
 * Sphere custody client (`sphere:*`, Eidolon I4). Replies are the JSON lines
 * of `cipher-runtime sphere …` (Eidolon: docs/HANDOVER_SPHERE_CLIENT §3),
 * paths stripped. `state` is the user-facing verdict of a sphere.
 */
type SphereState = 'finale' | 'en attente' | 'brûlée' | 'invalide';

type SphereStatus = {
  sphere_id: string;
  rarity: string;
  name?: string | null;
  owner?: string | null;
  seq: number;
  head_hash: string;
  ok: boolean;
  final: boolean;
  final_by?: 'receipt' | 'checkpoint' | null;
  revealed: boolean;
  burned: boolean;
  pending: boolean;
  controllable: boolean;
  errors: string[];
  state: SphereState;
  /** Runtime ≥ 1.3.2: theme / manifestation / essence / cosmic signature of the revealed template. */
  visual?: {
    theme: string | null;
    manifestation: string | null;
    essence: string | null;
    signature: Partial<Record<string, string | null>>;
  } | null;
};

type SphereFailure = { ok: false; error: string; errorCode?: string; sphereId?: string };

type SphereListResult =
  | { ok: true; vault_id: string; count: number; spheres: SphereStatus[]; trusted_issuer: boolean; genesis_cached: boolean }
  | SphereFailure;

type SphereSyncResult =
  | {
      ok: true;
      vault_id: string;
      resubmitted: string[];
      updated: string[];
      received: string[];
      transferred_away: string[];
      burned: string[];
      mismatches: string[];
      queued: string[];
      final: number;
      waiting: number;
      errors: Record<string, string>;
      spheres: SphereStatus[];
      /** runtime ≥ 1.2.1 */
      trusted_issuer?: boolean;
      genesis_cached?: boolean;
      /** runtime ≥ 1.3.1: ids the treasury still holds for this vault (a right, not a head — claim them). */
      claimable?: string[];
    }
  | SphereFailure;

type SphereClaimResult =
  | {
      ok: true;
      vault_id: string;
      vault_number?: number | null;
      claimed: SphereStatus[];
      already: SphereStatus[];
      deferred: string[];
      errors: Record<string, string>;
    }
  | SphereFailure;

type SphereMailboxResult =
  | { ok: true; vault_id: string; deposited: number; pending?: number | null; first_index: number; next_index: number }
  | SphereFailure;

type SphereTransferResult =
  | { ok: true; vault_id: string; sphere_id: string; to: string; seq: number; head_hash: string; final: boolean; state: SphereState }
  | SphereFailure;

type SphereImportResult =
  | {
      ok: true;
      vault_id: string;
      sphere_id: string;
      state: SphereState;
      final: boolean;
      final_by?: 'receipt' | 'checkpoint' | null;
      revealed: boolean;
      seq: number;
      head_hash: string;
      submitted: number[];
      status: SphereStatus;
      filename: string;
    }
  | SphereFailure;

type SphereExportResult =
  | { ok: true; sphereId: string; state: SphereState; filename: string; size: number }
  | SphereFailure;

/** runtime ≥ 1.2.1 — the claims the anchor deferred for this vault. */
type SphereQueueResult =
  | { ok: true; vault_id: string; count: number; queued: { sphere_id: string; vault_number: number; requested_at: string }[] }
  | SphereFailure;

/** runtime ≥ 1.2.1 — a custody step signed by this vault: burn (irreversible) or reissue-key (the sphere stays). */
type SphereCustodyResult =
  | { ok: true; vault_id: string; sphere_id: string; to: string | null; seq: number; head_hash: string; reason: string; final: boolean; state: SphereState }
  | SphereFailure;

/**
 * Escrow Nexus (`escrow:*`, Eidolon escrow_7d). Replies are the JSON lines of
 * `cipher-runtime escrow …` (Eidolon: docs/HANDOVER_ESCROW_7D §7), paths
 * stripped. `conditions` are the cleartext release conditions of the
 * envelope; `releasable` / `reason` is what `check_release` said.
 */
type EscrowCondition =
  | { type: 'time_lock'; release_after: string }
  | { type: 'owner_signature'; expected_vault_id: string }
  | { type: 'combined_all' | 'combined_any'; children: EscrowCondition[] }
  | { type: string; [key: string]: unknown };

type EscrowEntry = {
  escrow_id: string;
  label: string;
  deposited_at: string;
  payload_size: number;
  conditions: EscrowCondition[];
  release_after: string | null;
  releasable: boolean;
  reason: string;
  depositor_vault_id_prefix: string;
  schema_version: number;
  crypto_suite: string;
};

type EscrowFailure = { ok: false; error: string; errorCode?: string; releaseAfter?: string };

type EscrowListResult =
  | { ok: true; vault_id: string; count: number; escrows: EscrowEntry[]; unreadable: { escrow_id: string; error: string }[] }
  | EscrowFailure;

type EscrowDepositResult = ({ ok: true; filename: string } & EscrowEntry) | EscrowFailure;

type EscrowRetrieveResult = { ok: true; escrowId: string; filename: string; size: number } | EscrowFailure;

type EscrowVerifyResult =
  | { ok: true; checked: number; failed: number; results: { escrow_id: string; integrity_ok: boolean; reason: string }[] }
  | EscrowFailure;

type EscrowDeleteResult = { ok: true; escrow_id: string; deleted: boolean } | EscrowFailure;

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
      readPsnxFile?: (psnxPath: string) => Promise<ReadPsnxResult>;
      genesis?: {
        start: (name: string) => Promise<GenesisStartResult>;
        cancel: (runId: string) => Promise<{ ok: boolean }>;
        onEvent: (callback: (payload: GenesisStreamEvent) => void) => () => void;
      };
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
      importVaultKeybundle?: (bytes: Uint8Array) => Promise<
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
          }
        | { ok: false; error: string }
      >;
      exportVaultKeybundle?: (vaultId: string) => Promise<
        | {
            ok: true;
            bytes: Uint8Array;
            filename: string;
            vaultId: string;
            vaultName: string;
            sha256: string;
            size: number;
          }
        | { ok: false; error: string }
      >;
      vaultFiles?: {
        list: () => Promise<VaultFilesListResult>;
        saveCopies: (kinds: VaultFileKind[]) => Promise<VaultFilesSaveCopiesResult>;
        saveKeybundle: (vaultId: string) => Promise<VaultFilesSaveKeybundleResult>;
        reveal: () => Promise<VaultFilesRevealResult>;
      };
      deriveVaultE2EESeed?: (vaultId: string) => Promise<VaultE2EESeedResult>;
      sphere?: {
        list: (vaultId: string) => Promise<SphereListResult>;
        sync: (vaultId: string, apiUrl?: string) => Promise<SphereSyncResult>;
        claim: (vaultId: string, apiUrl?: string) => Promise<SphereClaimResult>;
        mailbox: (vaultId: string, count?: number, apiUrl?: string) => Promise<SphereMailboxResult>;
        transfer: (vaultId: string, sphereId: string, to: string, apiUrl?: string) => Promise<SphereTransferResult>;
        importFile: (vaultId: string, apiUrl?: string) => Promise<SphereImportResult>;
        exportFile: (vaultId: string, sphereId: string) => Promise<SphereExportResult>;
        queue: (vaultId: string, apiUrl?: string) => Promise<SphereQueueResult>;
        /** `confirm` must be true: main refuses otherwise (burning is irreversible). */
        burn: (vaultId: string, sphereId: string, confirm: boolean, apiUrl?: string) => Promise<SphereCustodyResult>;
        /** `force` revokes a signed, unsubmitted transfer of that sphere by a second signature. */
        reissueKey: (vaultId: string, sphereId: string, force: boolean, apiUrl?: string) => Promise<SphereCustodyResult>;
      };
      escrow?: {
        list: (vaultId: string) => Promise<EscrowListResult>;
        deposit: (
          vaultId: string,
          options?: { label?: string; releaseAfter?: string; ownerOnly?: boolean }
        ) => Promise<EscrowDepositResult>;
        retrieve: (vaultId: string, escrowId: string, suggestedName?: string) => Promise<EscrowRetrieveResult>;
        verify: (vaultId: string, escrowId?: string) => Promise<EscrowVerifyResult>;
        remove: (vaultId: string, escrowId: string) => Promise<EscrowDeleteResult>;
      };
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
