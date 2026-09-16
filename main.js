import electron from 'electron';
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, powerMonitor, safeStorage, shell } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync, constants as fsConstants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let backendProcess = null;
let tray = null;
let isQuitting = false;
const VAULT_BRIDGE_FILE = 'eidolon_cipher_bridge.json';

// Tray prefs live in userData (machine-bound, not account-bound). Loaded
// synchronously at startup so the close handler can read them without an
// async dance.
const TRAY_PREFS_DEFAULT = { minimizeToTray: false, firstCloseShown: false, locale: 'en' };
let trayPrefs = { ...TRAY_PREFS_DEFAULT };

function trayPrefsPath() {
  return path.join(app.getPath('userData'), 'tray-prefs.json');
}

function loadTrayPrefs() {
  try {
    const raw = readFileSync(trayPrefsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    trayPrefs = { ...TRAY_PREFS_DEFAULT, ...parsed };
  } catch {
    trayPrefs = { ...TRAY_PREFS_DEFAULT };
  }
}

function saveTrayPrefs() {
  try {
    writeFileSync(trayPrefsPath(), JSON.stringify(trayPrefs), 'utf8');
  } catch (err) {
    console.error('[tray] Failed to save prefs:', err);
  }
}

// Tray menu strings — bundled here because the main process cannot reach
// react-i18next. Keep these in sync with the 8 locale JSON files. EN is the
// fallback; locales without a native string fall through to EN.
// Also carries the titles of the native dialogs opened by the vault-files
// handover (main-side strings; the renderer keeps main in sync via tray.setLocale).
const TRAY_STRINGS = {
  en: { tooltip: 'Cipher', show: 'Show Cipher', quit: 'Quit Cipher', balloonTitle: 'Cipher keeps running', balloonBody: 'Cipher is still running in the system tray. Right-click the icon to quit.', vaultFilesDirTitle: 'Choose a folder for your vault files', vaultFilesDirButton: 'Save here', vaultKeybundleTitle: 'Save your identity (keybundle)' },
  fr: { tooltip: 'Cipher', show: 'Afficher Cipher', quit: 'Quitter Cipher', balloonTitle: 'Cipher continue de tourner', balloonBody: 'Cipher reste actif dans la barre des tâches. Clic droit sur l’icône pour quitter.', vaultFilesDirTitle: 'Choisissez un dossier pour vos fichiers de vault', vaultFilesDirButton: 'Enregistrer ici', vaultKeybundleTitle: 'Enregistrer votre identité (keybundle)' },
  de: { tooltip: 'Cipher', show: 'Cipher anzeigen', quit: 'Cipher beenden', balloonTitle: 'Cipher läuft weiter', balloonBody: 'Cipher läuft noch im Infobereich. Rechtsklick auf das Symbol zum Beenden.', vaultFilesDirTitle: 'Ordner für Ihre Vault-Dateien wählen', vaultFilesDirButton: 'Hier speichern', vaultKeybundleTitle: 'Ihre Identität speichern (Keybundle)' },
  es: { tooltip: 'Cipher', show: 'Mostrar Cipher', quit: 'Salir de Cipher', balloonTitle: 'Cipher sigue funcionando', balloonBody: 'Cipher sigue activo en la bandeja del sistema. Clic derecho en el icono para salir.', vaultFilesDirTitle: 'Elija una carpeta para sus archivos de vault', vaultFilesDirButton: 'Guardar aquí', vaultKeybundleTitle: 'Guardar su identidad (keybundle)' },
  it: { tooltip: 'Cipher', show: 'Mostra Cipher', quit: 'Esci da Cipher', balloonTitle: 'Cipher è ancora attivo', balloonBody: 'Cipher è ancora in esecuzione nell’area di notifica. Clic destro sull’icona per uscire.', vaultFilesDirTitle: 'Scegli una cartella per i file del tuo vault', vaultFilesDirButton: 'Salva qui', vaultKeybundleTitle: 'Salva la tua identità (keybundle)' },
  pt: { tooltip: 'Cipher', show: 'Mostrar Cipher', quit: 'Sair do Cipher', balloonTitle: 'Cipher continua em execução', balloonBody: 'O Cipher ainda está em execução na bandeja do sistema. Clique com o botão direito no ícone para sair.', vaultFilesDirTitle: 'Escolha uma pasta para os arquivos do seu vault', vaultFilesDirButton: 'Salvar aqui', vaultKeybundleTitle: 'Salvar sua identidade (keybundle)' },
  ru: { tooltip: 'Cipher', show: 'Показать Cipher', quit: 'Выйти из Cipher', balloonTitle: 'Cipher продолжает работу', balloonBody: 'Cipher всё ещё работает в системном трее. Щёлкните по значку правой кнопкой, чтобы выйти.', vaultFilesDirTitle: 'Выберите папку для файлов хранилища', vaultFilesDirButton: 'Сохранить здесь', vaultKeybundleTitle: 'Сохранить вашу личность (keybundle)' },
  'zh-CN': { tooltip: 'Cipher', show: '显示 Cipher', quit: '退出 Cipher', balloonTitle: 'Cipher 仍在运行', balloonBody: 'Cipher 仍在系统托盘中运行。右键单击图标以退出。', vaultFilesDirTitle: '选择保存保险库文件的文件夹', vaultFilesDirButton: '保存到此处', vaultKeybundleTitle: '保存您的身份（keybundle）' },
};

function getTrayStrings() {
  return TRAY_STRINGS[trayPrefs.locale] || TRAY_STRINGS.en;
}

// Load bridge env files so the main process (and child Python subprocesses
// that inherit process.env) see EIDOLON_CONNECT_SESSION_SECRET,
// EIDOLON_SERVER_URL, EIDOLON_API_SECRET, etc.
//
// Priority (first match wins — already-set env vars always take precedence):
//   1. Shell / process env already set
//   2. apps/bridge/.env              (developer local overrides)
function loadBridgeEnvFile(filename) {
  try {
    const envPath = path.join(__dirname, 'apps', 'bridge', filename);
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // file not found or unreadable — non-fatal
  }
}
loadBridgeEnvFile('.env');
const DEFAULT_EIDOLON_DOWNLOAD_URL =
  process.env.EIDOLON_DOWNLOAD_URL || 'https://github.com/Oykdo/Project_Logos/releases';
const DEFAULT_EIDOLON_INFO_URL =
  process.env.EIDOLON_INFO_URL || DEFAULT_EIDOLON_DOWNLOAD_URL;
const DEFAULT_EIDOLON_CONNECT_URL =
  process.env.EIDOLON_CONNECT_URL || 'http://127.0.0.1:8000';

function getEidolonLauncherCandidates() {
  return [
    path.join(__dirname, '..', 'Eidolon', 'launcher.bat'),
    path.join(__dirname, '..', 'Eidolon', 'src', 'ui', 'launcher.py'),
    path.join(process.cwd(), '..', 'Eidolon', 'launcher.bat'),
    path.join(process.cwd(), '..', 'Eidolon', 'src', 'ui', 'launcher.py'),
    path.join(process.resourcesPath, 'Eidolon', 'launcher.bat'),
    path.join(process.resourcesPath, 'Eidolon', 'src', 'ui', 'launcher.py'),
  ];
}

function getEidolonInstallerCandidates() {
  return [
    path.join(process.resourcesPath, 'eidolon-installer', 'Eidolon-Setup.exe'),
    path.join(process.resourcesPath, 'eidolon-installer', 'Eidolon-Installer.exe'),
    path.join(process.resourcesPath, 'eidolon-installer', 'Eidolon-Setup.msi'),
    path.join(__dirname, 'assets', 'eidolon-installer', 'Eidolon-Setup.exe'),
    path.join(__dirname, 'assets', 'eidolon-installer', 'Eidolon-Installer.exe'),
    path.join(__dirname, 'assets', 'eidolon-installer', 'Eidolon-Setup.msi'),
  ];
}

async function findFirstAccessiblePath(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function resolveEidolonLauncher() {
  return findFirstAccessiblePath(getEidolonLauncherCandidates());
}

async function resolveEidolonInstaller() {
  return findFirstAccessiblePath(getEidolonInstallerCandidates());
}

const KEYBUNDLE_CLI_REL = path.join('scripts', 'public', 'keybundle_cli.py');

// The frozen ceremony runtime, published as an Eidolon release asset. One
// binary exposing two subcommands, `ceremony` and `keybundle`, so Cipher can
// ship Genesis without shipping the Eidolon crypto core or a Python tree.
const CIPHER_RUNTIME_NAME = process.platform === 'win32' ? 'cipher-runtime.exe' : 'cipher-runtime';

let _cipherRuntimeCache;

/**
 * Absolute path to the frozen runtime, or null when only the legacy Python
 * tree is available. Resolved once: the answer cannot change while the app is
 * running, and every ceremony and keybundle call would otherwise re-stat the
 * same dozen candidate directories.
 */
function resolveCipherRuntime() {
  if (_cipherRuntimeCache !== undefined) return _cipherRuntimeCache;

  const candidates = [];
  if (process.env.CIPHER_RUNTIME_BIN) candidates.push(process.env.CIPHER_RUNTIME_BIN);
  // electron-builder extraResources drops it next to the Eidolon tree.
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, CIPHER_RUNTIME_NAME));
    candidates.push(path.join(process.resourcesPath, 'Eidolon', CIPHER_RUNTIME_NAME));
  }
  for (const root of getEidolonRootCandidates()) {
    candidates.push(path.join(root, CIPHER_RUNTIME_NAME));
    // Where the build scripts leave it during development.
    candidates.push(path.join(root, 'dist-cipher-runtime', CIPHER_RUNTIME_NAME));
    candidates.push(path.join(root, 'dist-cipher-runtime-linux', CIPHER_RUNTIME_NAME));
  }

  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        _cipherRuntimeCache = path.resolve(candidate);
        console.log('[eidolon] frozen runtime:', _cipherRuntimeCache);
        return _cipherRuntimeCache;
      }
    } catch {
      // unreadable candidate, try the next
    }
  }

  _cipherRuntimeCache = null;
  return null;
}

function getEidolonRootCandidates() {
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const resolved = path.resolve(candidate);
    if (!seen.has(resolved)) seen.add(resolved);
  };

  if (process.env.EIDOLON_ROOT) add(process.env.EIDOLON_ROOT);

  // electron-builder extraResources → resources/Eidolon (see bundle-eidolon-runtime.mjs)
  if (process.resourcesPath) add(path.join(process.resourcesPath, 'Eidolon'));

  add(path.join(__dirname, 'assets', 'eidolon-runtime'));
  add(path.join(__dirname, '..', 'Eidolon'));
  add(path.join(process.cwd(), '..', 'Eidolon'));
  add(path.join(process.cwd(), 'Eidolon'));

  let dir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  for (let depth = 0; depth < 10; depth++) {
    add(path.join(dir, 'Eidolon'));
    add(path.join(dir, '..', 'Eidolon'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return [...seen];
}

async function resolveEidolonRoot() {
  // The marker must accept EITHER layout. Gating only on keybundle_cli.py
  // meant that the day the Python tree is replaced by the frozen binary, this
  // returns null and the two consumers that never spawn anything — the vault
  // metrics reader and the vault-bridge context reader — silently degrade to
  // "Eidolon workspace not found".
  for (const root of getEidolonRootCandidates()) {
    for (const marker of [KEYBUNDLE_CLI_REL, CIPHER_RUNTIME_NAME]) {
      try {
        await fs.access(path.join(root, marker));
        return root;
      } catch {
        // try the next marker, then the next candidate
      }
    }
  }
  return null;
}

function parseNumberString(value) {
  const normalized = String(value || '').replace(/[^\d]/g, '');
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractViewerMetrics(html, vaultNumber) {
  if (!html || (vaultNumber !== undefined && vaultNumber !== null)) {
    const vaultRegex = new RegExp(
      `<span class="info-label">Vault<\\/span>\\s*<span class="info-value">#${vaultNumber}<\\/span>`,
      'i'
    );
    if (vaultNumber !== undefined && vaultNumber !== null && !vaultRegex.test(html)) {
      return null;
    }
  }

  const entropyMatch = html.match(
    /<div class="entropy-value">([\d,]+)<\/div>\s*<div class="entropy-label">[^<]*<\/div>\s*<div class="entropy-value"[^>]*>([\d,]+)<\/div>/i
  );

  if (!entropyMatch) {
    return null;
  }

  return {
    sourceEntropyBits: parseNumberString(entropyMatch[1]),
    holographicComplexityBits: parseNumberString(entropyMatch[2]),
  };
}

async function readEidolonVaultMetrics(vaultRef = {}) {
  const eidolonRoot = await resolveEidolonRoot();
  if (!eidolonRoot) {
    return { ok: false, error: 'Eidolon workspace not found on this device.' };
  }

  const registryPath = path.join(eidolonRoot, 'data', 'vaults', 'identities', 'vault_registry.json');
  let registry;
  try {
    const rawRegistry = await fs.readFile(registryPath, 'utf8');
    registry = JSON.parse(rawRegistry);
  } catch (error) {
    return { ok: false, error: 'Unable to read the Eidolon vault registry.' };
  }

  const vaults = registry?.vaults && typeof registry.vaults === 'object' ? registry.vaults : {};
  const byId = typeof vaultRef?.vaultId === 'string' ? vaults[vaultRef.vaultId] : undefined;
  const vaultEntry =
    byId ||
    Object.values(vaults).find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      if (vaultRef?.vaultNumber !== undefined && candidate.vault_number === vaultRef.vaultNumber) return true;
      return false;
    });

  if (!vaultEntry) {
    return { ok: false, error: 'Connected Eidolon vault metadata was not found.' };
  }

  let rawEntropyBits = null;
  let sourceEntropyBits = null;
  let spinorSignature = null;
  let bellMax = null;
  let bellViolations = null;
  let bellIsQuantum = null;
  let prismEpoch = null;
  let createdAt = null;

  if (vaultEntry.blend_path) {
    try {
      const rawBlend = await fs.readFile(vaultEntry.blend_path, 'utf8');
      const blendData = JSON.parse(rawBlend);
      const crypto = blendData?.crypto_properties && typeof blendData.crypto_properties === 'object'
        ? blendData.crypto_properties
        : {};

      rawEntropyBits =
        parseNumberString(crypto.psnx_entropy_bits) ??
        parseNumberString(crypto.psnx_min_entropy_bits);
      sourceEntropyBits = parseNumberString(crypto.psnx_min_entropy_bits) ?? 512;

      // Crypto fingerprints that drive the holographic avatar layers L9 + L10
      spinorSignature = typeof crypto.psnx_spinor_signature === 'string'
        ? crypto.psnx_spinor_signature
        : null;
      bellMax = parseNumberString(crypto.psnx_bell_max);
      bellViolations = parseNumberString(crypto.psnx_bell_violations);
      bellIsQuantum = crypto.psnx_is_quantum === 'true' || crypto.psnx_is_quantum === true;

      // prism_epoch lives at the blend_data top level (not under crypto_properties)
      // and reflects temporal drift for layer L8. Fallback: client can recompute
      // from createdAt if the stored value hasn't been refreshed by runtime_tick.
      prismEpoch = parseNumberString(blendData.prism_epoch);
      createdAt = typeof crypto.psnx_created === 'string' ? crypto.psnx_created : null;
    } catch {
      // Keep registry data even if blend metadata cannot be opened.
    }
  }

  let viewerMetrics = null;
  const viewerDir = path.join(eidolonRoot, 'data', 'avatars', 'viewers');
  try {
    const viewerFiles = await fs.readdir(viewerDir);
    for (const fileName of viewerFiles) {
      if (!fileName.toLowerCase().endsWith('.html')) continue;
      const filePath = path.join(viewerDir, fileName);
      const html = await fs.readFile(filePath, 'utf8');
      const extracted = extractViewerMetrics(html, vaultEntry.vault_number);
      if (extracted) {
        viewerMetrics = extracted;
        break;
      }
    }
  } catch {
    // Viewer not generated yet.
  }

  return {
    ok: true,
    metrics: {
      vaultId: vaultEntry.vault_id,
      vaultNumber: vaultEntry.vault_number,
      vaultName: vaultEntry.vault_name,
      rawEntropyBits,
      sourceEntropyBits: viewerMetrics?.sourceEntropyBits ?? sourceEntropyBits,
      holographicComplexityBits: viewerMetrics?.holographicComplexityBits ?? null,
      resonanceScore: vaultEntry.resonance_score ?? 50,
      operationalEntropy: vaultEntry.operational_entropy ?? 0,
      eidolonBalance: vaultEntry.eidolon_balance ?? 0,
      holographicDepthLevel: vaultEntry.holographic_depth_level ?? 0,
      pioneerTier: vaultEntry.pioneer_tier ?? 'standard',
      lifetimeEidolonEarned: vaultEntry.lifetime_eidolon_earned ?? 0,
      lifetimeEidolonSpent: vaultEntry.lifetime_eidolon_spent ?? 0,
      spinorSignature,
      bellMax,
      bellViolations,
      bellIsQuantum,
      prismEpoch,
      createdAt,
    },
  };
}

async function probeEidolonConnect(payload = {}) {
  const baseUrl =
    typeof payload?.baseUrl === 'string' && payload.baseUrl.trim()
      ? payload.baseUrl.trim().replace(/\/$/, '')
      : DEFAULT_EIDOLON_CONNECT_URL;
  const appId =
    typeof payload?.appId === 'string' && payload.appId.trim()
      ? payload.appId.trim().toLowerCase()
      : 'cipher.desktop';

  try {
    const capabilitiesResponse = await fetch(`${baseUrl}/connect/capabilities`);
    const capabilities = await capabilitiesResponse.json().catch(() => ({}));
    if (!capabilitiesResponse.ok) {
      return {
        ok: false,
        baseUrl,
        error: capabilities?.detail || capabilities?.error || `Capabilities HTTP ${capabilitiesResponse.status}`,
      };
    }

    // Registration POST requires HMAC signature which the desktop client
    // doesn't hold. Try it as best-effort; if it fails (e.g. "invalid
    // signature" on a remote server), check if the app is already approved
    // via GET. The probe succeeds as long as capabilities are reachable.
    let registration;
    try {
      const registrationResponse = await fetch(`${baseUrl}/connect/apps/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          app_name: 'Cipher Desktop',
          scopes: ['auth', 'read_public_identity'],
          display_origin: 'cipher-desktop',
          redirect_uri: 'cipher://callback',
        }),
      });
      if (registrationResponse.ok) {
        registration = await registrationResponse.json().catch(() => undefined);
      }
    } catch {
      // POST registration failed — not fatal
    }

    // If POST registration didn't yield an approved status, check GET
    if (!registration || registration.status !== 'approved') {
      try {
        const existing = await fetch(`${baseUrl}/connect/apps/${encodeURIComponent(appId)}`);
        if (existing.ok) {
          const existingData = await existing.json().catch(() => ({}));
          if (existingData?.data?.status === 'approved') {
            registration = existingData.data;
          }
        }
      } catch {
        // GET check failed — not fatal
      }
    }

    return {
      ok: true,
      baseUrl,
      capabilities,
      registration: registration || undefined,
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : 'Unable to reach Eidolon Connect.',
    };
  }
}

async function createEidolonConnectSession(payload = {}) {
  const baseUrl =
    typeof payload?.baseUrl === 'string' && payload.baseUrl.trim()
      ? payload.baseUrl.trim().replace(/\/$/, '')
      : DEFAULT_EIDOLON_CONNECT_URL;
  const appId =
    typeof payload?.appId === 'string' && payload.appId.trim()
      ? payload.appId.trim().toLowerCase()
      : 'cipher.desktop';

  if (!payload?.vaultId || typeof payload.vaultId !== 'string' || !payload.vaultId.trim()) {
    return {
      ok: false,
      baseUrl,
      error: 'vaultId is required to create an Eidolon Connect session.',
    };
  }

  const connectSecret = process.env.EIDOLON_CONNECT_SESSION_SECRET || '';

  try {
    // Ensure app is registered on the worker that will handle the session request
    await fetch(`${baseUrl}/connect/apps/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        app_name: 'Cipher Desktop',
        scopes: ['auth', 'read_public_identity'],
        display_origin: 'cipher-desktop',
        redirect_uri: 'cipher://callback',
      }),
    }).catch(() => {});

    // Auto-approve the local desktop app. `issue_connect_session` rejects
    // anything that isn't `approved`, and registration alone leaves the app
    // in `pending_consent`. The approve endpoint accepts loopback without an
    // admin secret, so the desktop bundle can self-promote its own app_id —
    // this is a UX convenience strictly limited to Cipher Desktop talking to
    // its own local Eidolon worker. Remote Connect apps still go through
    // explicit operator approval.
    await fetch(`${baseUrl}/connect/apps/${encodeURIComponent(appId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted_scopes: ['auth', 'read_public_identity'] }),
    }).catch(() => {});

    const headers = { 'Content-Type': 'application/json' };
    if (connectSecret) {
      headers['X-Eidolon-Connect-Secret'] = connectSecret;
    }
    const response = await fetch(`${baseUrl}/connect/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: appId,
        vault_id: payload.vaultId.trim(),
        vault_number: typeof payload.vaultNumber === 'number' ? payload.vaultNumber : undefined,
        vault_name: typeof payload.vaultName === 'string' ? payload.vaultName : undefined,
        source: typeof payload.source === 'string' ? payload.source : 'cipher-desktop',
        created_at: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
      }),
    });
    const session = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        baseUrl,
        error: session?.detail || session?.error || `Session HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      baseUrl,
      session,
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : 'Unable to create an Eidolon Connect session.',
    };
  }
}

function buildEidolonInstallPayload(extra = {}) {
  return {
    ok: false,
    status: 'install_required',
    error: 'Eidolon is not installed yet on this device.',
    downloadUrl: DEFAULT_EIDOLON_DOWNLOAD_URL,
    infoUrl: DEFAULT_EIDOLON_INFO_URL,
    ...extra,
  };
}

async function launchEidolonLauncher() {
  const launcherPath = await resolveEidolonLauncher();
  if (!launcherPath) {
    const installerPath = await resolveEidolonInstaller();
    return buildEidolonInstallPayload({
      installerPath: installerPath || undefined,
      error: installerPath
        ? 'Eidolon is not installed yet. A local installer is ready.'
        : 'Eidolon launcher not found near this Cipher installation.',
    });
  }

  if (launcherPath.toLowerCase().endsWith('.bat')) {
    const child = spawn('cmd.exe', ['/c', launcherPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true, status: 'launched', path: launcherPath, mode: 'batch' };
  }

  const child = spawn(process.execPath, [launcherPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { ok: true, status: 'launched', path: launcherPath, mode: 'python' };
}

async function openEidolonInstaller() {
  const installerPath = await resolveEidolonInstaller();
  if (installerPath) {
    const openError = await shell.openPath(installerPath);
    if (openError) {
      return buildEidolonInstallPayload({
        installerPath,
        error: openError,
      });
    }

    return {
      ok: true,
      status: 'installer_opened',
      path: installerPath,
      mode: 'local-installer',
    };
  }

  await shell.openExternal(DEFAULT_EIDOLON_DOWNLOAD_URL);
  return {
    ok: true,
    status: 'download_opened',
    downloadUrl: DEFAULT_EIDOLON_DOWNLOAD_URL,
    infoUrl: DEFAULT_EIDOLON_INFO_URL,
    mode: 'external-download',
  };
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      loadTrayPrefs();
      await startBackend();
      await createWindow();
      createTray();

      // Forward OS power-resume events to the renderer so the WebSocket
      // layers can drop their dead sockets and reconnect cleanly. Without
      // this, Chromium emits ERR_NETWORK_IO_SUSPENDED on the stale socket
      // after wake-from-sleep and Socket.IO retries blindly while the
      // network is still coming back up.
      powerMonitor.on('resume', () => {
        console.info('[main] power: system resumed, notifying renderer');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('power:resume');
        }
      });
    } catch (error) {
      console.error('Failed to start application:', error);
      app.quit();
    }
  });
}

async function startBackend() {
  // Privacy-l1 / centralized model: the packaged installer talks to the
  // hosted bridge configured in apps/frontend/.env.production
  // (VITE_API_BASE_URL = https://cipher-bridge.fly.dev). The bundled
  // bridge is kept in the installer as an opt-in for self-hosting /
  // offline development scenarios, but is no longer auto-spawned —
  // running it would require a per-device DATABASE_URL and JWT_SECRET
  // that the contract forbids us from shipping in plaintext.
  //
  // In dev, `npm run dev` already spawns the bridge on :4000 via the
  // `dev:bridge` concurrently pane. Spawning a second one here on :4001
  // is a duplicate — both share the same DATABASE_URL and PSI cache,
  // and the second always loses the race during `initializePsiServer`,
  // which is exactly the "Backend startup timeout" that was firing in
  // dev. Skip the spawn unless the operator explicitly opts in.
  //
  // To opt back in (e.g. for a fully self-hosted packaged install on a
  // private network, or to debug the bundled bridge in dev), set
  // CIPHER_BUNDLED_BRIDGE=true before launching the app.
  if (process.env.CIPHER_BUNDLED_BRIDGE !== 'true') {
    console.log('[startBackend] Hosted bridge mode — skipping local bridge spawn');
    return;
  }

  return new Promise((resolve, reject) => {
    const backendPath = app.isPackaged
      ? path.join(process.resourcesPath, 'apps', 'bridge', 'dist', 'index.js')
      : path.join(__dirname, 'apps', 'bridge', 'src', 'index.ts');

    /** @type {import('node:child_process').ForkOptions} */

    const options = {
      cwd: app.isPackaged 
        ? path.join(process.resourcesPath, 'apps', 'bridge')
        : path.join(__dirname, 'apps', 'bridge'),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        PORT: '4001'
      }
    };

    // Start backend server
    if (app.isPackaged) {
      backendProcess = fork(backendPath, [], options);
    } else {
      // In dev, use tsx to run TypeScript
      backendProcess = fork(backendPath, [], {
        ...options,
        execArgv: ['--import', 'tsx']
      });
    }

    backendProcess.on('error', (err) => {
      console.error('Backend process error:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
    });

    // Wait for backend to be ready with health check
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max
    const checkInterval = 500; // Check every 500ms

    const checkHealth = setInterval(async () => {
      attempts++;
      try {
        const http = await import('http');
        const req = http.request({
          hostname: 'localhost',
          port: 4001,
          path: '/health',
          method: 'GET',
          timeout: 1000
        }, (res) => {
          if (res.statusCode === 200) {
            clearInterval(checkHealth);
            console.log('Backend is ready');
            resolve();
          }
        });
        req.on('error', () => {
          // Backend not ready yet, continue checking
        });
        req.end();
      } catch (error) {
        // Continue checking
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkHealth);
        console.error('Backend failed to start within 30 seconds');
        reject(new Error('Backend startup timeout'));
      }
    }, checkInterval);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Audio/video calls need microphone + camera. Without an explicit handler,
  // Electron 28+ silent-denies the getUserMedia prompt and the renderer just
  // sees a generic "Permission denied" — which is what the alpha tester hit.
  // Allow `media` only for our own origins (Vite dev server, packaged
  // file://, hosted bridge); deny everything else (notifications, geolocation,
  // etc.) by default.
  const mediaAllowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4000',
    'http://localhost:4001',
    'https://cipher-bridge.fly.dev',
  ]);
  const isMediaOriginAllowed = (origin) => {
    if (!origin) return false;
    if (origin === 'file://') return true;
    return mediaAllowedOrigins.has(origin);
  };
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') {
      callback(isMediaOriginAllowed(details?.requestingUrl ? new URL(details.requestingUrl).origin : null));
      return;
    }
    callback(false);
  });
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (permission === 'media') {
      return isMediaOriginAllowed(requestingOrigin);
    }
    return false;
  });

  // Security: deny every popup by default, except the canonical Eidolon
  // hologram viewer which ships as a self-contained HTML page served by the
  // local bridge at /api/v2/vault/viewer/avatar_<hex>.html. Those open in the
  // user's default browser via shell.openExternal so Three.js has a clean
  // WebGL context and the user can keep Cipher running underneath.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const isBridgeOrigin =
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
        && (parsed.port === '4000' || parsed.port === '4001' || parsed.port === '5173');
      if (isBridgeOrigin && /^\/api\/v2\/vault\/viewer\/avatar_[a-f0-9]+\.html$/i.test(parsed.pathname)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {
      // malformed URL → fall through to deny
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  // Tray-aware close: when minimizeToTray is on, the X button hides the
  // window instead of letting it close. The real exit path is the tray
  // menu's "Quit" item (or auto-update / OS shutdown), which sets
  // isQuitting = true before calling app.quit().
  mainWindow.on('close', (e) => {
    if (trayPrefs.minimizeToTray && !isQuitting && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
      maybeShowFirstCloseBalloon();
    }
  });

  // Load app
  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, 'apps', 'frontend', 'dist', 'index.html'));
  } else {
    // Dev mode - load from Vite dev server
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  // Tray is a Windows + Linux feature here. macOS dock already provides the
  // "stays alive" behavior natively; status-bar items are a separate design
  // and deferred with the macOS packaging.
  if (process.platform === 'darwin') return;

  try {
    // Windows tray expects 16/32 px; the 512×512 PNG produced an
    // invisible-but-clickable empty slot (the system-tray "ghost icon"
    // bug — visible space, no glyph). Prefer the multi-resolution .ico
    // on Windows: it carries the right sizes and Windows picks the one
    // matching the current DPI. Linux still uses the PNG (no .ico
    // convention), but resized to 22 px as a defense-in-depth — some
    // Linux DEs also dislike a 512 px source image.
    const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    const iconPath = path.join(__dirname, 'assets', iconFile);
    let image = nativeImage.createFromPath(iconPath);
    if (process.platform !== 'win32' && !image.isEmpty()) {
      image = image.resize({ width: 22, height: 22 });
    }
    tray = new Tray(image);
    tray.setToolTip(getTrayStrings().tooltip);
    rebuildTrayMenu();

    // Single click toggles visibility on Windows (canonical UX). On Linux
    // the click event is unreliable across desktops, so right-click +
    // context menu is the supported interaction.
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('[tray] Failed to create tray icon:', err);
    tray = null;
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const s = getTrayStrings();
  const menu = Menu.buildFromTemplate([
    {
      label: s.show,
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: s.quit,
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(s.tooltip);
}

function maybeShowFirstCloseBalloon() {
  if (trayPrefs.firstCloseShown) return;
  const s = getTrayStrings();
  try {
    if (process.platform === 'win32' && tray && typeof tray.displayBalloon === 'function') {
      tray.displayBalloon({ title: s.balloonTitle, content: s.balloonBody, iconType: 'info' });
    } else if (Notification.isSupported()) {
      new Notification({ title: s.balloonTitle, body: s.balloonBody }).show();
    }
  } catch (err) {
    console.error('[tray] Failed to show first-close balloon:', err);
  }
  trayPrefs.firstCloseShown = true;
  saveTrayPrefs();
}

app.on('window-all-closed', () => {
  // When minimizeToTray is on, this never fires (windows are hidden, not
  // closed). When off, it fires and we behave as before — kill backend +
  // quit on non-darwin.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Single source of truth for shutdown — runs on tray Quit, OS shutdown,
  // auto-update relaunch, Cmd+Q, etc.
  isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on('will-quit', () => {
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function isTrustedRendererEvent(event) {
  const frameUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  try {
    const parsed = new URL(frameUrl);
    if (parsed.protocol === 'file:') return true;
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '5173') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function requireTrustedRenderer(event) {
  if (!isTrustedRendererEvent(event)) {
    throw new Error('Untrusted renderer origin');
  }
}

// Handle IPC if needed
ipcMain.handle('get-app-path', (event) => {
  requireTrustedRenderer(event);
  return app.getPath('userData');
});

// Tray prefs IPC — owned by main process, persisted to userData/tray-prefs.json.
// Renderer reads on Settings panel mount and writes on toggle change.
ipcMain.handle('tray.getPref', () => ({ ...trayPrefs }));
ipcMain.handle('tray.setPref', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return { ...trayPrefs };
  if (typeof patch.minimizeToTray === 'boolean') {
    trayPrefs.minimizeToTray = patch.minimizeToTray;
  }
  saveTrayPrefs();
  return { ...trayPrefs };
});
ipcMain.handle('tray.setLocale', (_event, locale) => {
  if (typeof locale === 'string' && TRAY_STRINGS[locale]) {
    trayPrefs.locale = locale;
    saveTrayPrefs();
    rebuildTrayMenu();
  }
  return trayPrefs.locale;
});
ipcMain.handle('tray.quitNow', () => {
  isQuitting = true;
  app.quit();
});

function getVaultBridgeCandidates() {
  return [
    path.join(app.getPath('userData'), VAULT_BRIDGE_FILE),
    // The frozen runtime writes the bridge file next to sys._MEIPASS, i.e.
    // into TMPDIR. None of the source-tree relative candidates below can ever
    // find it, so the vault context was lost on every frozen ceremony.
    path.join(os.tmpdir(), VAULT_BRIDGE_FILE),
    path.join(__dirname, '..', VAULT_BRIDGE_FILE),
    path.join(process.cwd(), '..', VAULT_BRIDGE_FILE),
    path.join(process.cwd(), VAULT_BRIDGE_FILE),
  ];
}
let lastSelectedPsnxPath = null;

// --- Keybundle import/export (local Eidolon Python CLI) -----------------------
// Packaged Cipher loads the UI from file:// and talks to the hosted bridge for
// auth/messaging. Keybundle routes must run on the user's machine (extract .psnx
// + .blend_data into %LOCALAPPDATA%\Eidolon, write eidolon_cipher_bridge.json).

function resolveEidolonPython() {
  if (process.env.EIDOLON_PYTHON && existsSync(process.env.EIDOLON_PYTHON)) {
    return process.env.EIDOLON_PYTHON;
  }

  // Preferred: the self-contained CPython staged by
  // scripts/bundle-eidolon-runtime.mjs (python-build-standalone + numpy,
  // cryptography, eidolon_crypto). It carries its own stdlib, so the ceremony
  // runs on a machine with no Python installed at all.
  for (const root of getEidolonRootCandidates()) {
    const bundled = process.platform === 'win32'
      ? path.join(root, 'python', 'python.exe')
      : path.join(root, 'python', 'bin', 'python3');
    if (existsSync(bundled)) return bundled;
  }

  // Legacy fallback: a `python -m venv` tree staged by older builds.
  //
  // Existing on disk is not enough: a venv created by `python -m venv` keeps
  // only site-packages and points `pyvenv.cfg home` at the BUILD machine's
  // interpreter, so its stdlib is missing on a user's machine. Such a venv
  // must lose to a working system Python instead of silently winning and
  // failing later inside the ceremony.
  for (const root of getEidolonRootCandidates()) {
    const venvPython = process.platform === 'win32'
      ? path.join(root, 'venv', 'Scripts', 'python.exe')
      : path.join(root, 'venv', 'bin', 'python');
    if (!existsSync(venvPython)) continue;
    const probe = spawnSync(venvPython, ['-c', 'import os, sys'], { timeout: 15000 });
    if (probe.status === 0) return venvPython;
    console.warn('[eidolon] Ignoring non-functional bundled venv at', venvPython);
  }

  if (process.platform !== 'win32') {
    for (const abs of ['/usr/bin/python3', '/usr/local/bin/python3']) {
      if (existsSync(abs)) return abs;
    }
    const r = spawnSync('which', ['python3'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n')[0];
    return 'python3';
  }
  const isStub = (p) => /WindowsApps/i.test(p) || /AppInstaller/i.test(p);
  for (const cand of ['python.exe', 'py.exe']) {
    const r = spawnSync('where', [cand], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const found = r.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => !isStub(p));
      if (found[0] && existsSync(found[0])) return found[0];
    }
  }
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const known = [
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Windows\\py.exe',
  ];
  for (const p of known) if (existsSync(p)) return p;
  return 'python.exe';
}

/**
 * Absolute path of one of the public Eidolon CLI scripts (`scriptRel` is
 * relative to the Eidolon root), or null when no source tree is available.
 * Only consulted when the frozen `cipher-runtime` binary is absent.
 */
async function resolveEidolonScript(scriptRel) {
  const eidolonRoot = await resolveEidolonRoot();
  if (!eidolonRoot) return null;
  const script = path.join(eidolonRoot, scriptRel);
  return existsSync(script) ? script : null;
}

function getEidolonDataDir() {
  if (process.env.EIDOLON_DATA_DIR) return process.env.EIDOLON_DATA_DIR;

  // Returning null on Linux and macOS was a hard blocker for the frozen
  // runtime. The spawn sites drop EIDOLON_DATA_DIR from the child env when
  // this is null, and config/paths.get_user_data_root() then falls through
  // LOCALAPPDATA to get_project_root(), which for a frozen binary is
  // Path(sys.executable).parent — inside the read-only AppImage squashfs or a
  // root-owned /opt. get_keys_dir() mkdirs there and the ceremony dies before
  // phase 1.
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA;
    return localApp ? path.join(localApp, 'Eidolon') : path.join(os.homedir(), 'AppData', 'Local', 'Eidolon');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Eidolon');
  }
  const xdg = process.env.XDG_DATA_HOME;
  return xdg ? path.join(xdg, 'Eidolon') : path.join(os.homedir(), '.local', 'share', 'Eidolon');
}

function parseKeybundleCliJson(stdout) {
  const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // skip non-JSON lines
    }
  }
  return null;
}

/**
 * Spawn one subcommand of the Eidolon runtime and collect its output.
 * Same preference order as the ceremony: the frozen `cipher-runtime`
 * binary (`cipher-runtime <subcommand> ...args`), else the public Python
 * script `scriptRel` run from the Eidolon source tree.
 *
 * Resolves `{ stdout: Buffer, stderr: string, code }`. stdout stays a Buffer
 * so a caller receiving a secret on it (`e2ee-seed`) can zero it; the read
 * chunks are zeroed here as soon as they are concatenated. stdout is never
 * logged by this function.
 */
function runCipherRuntimeCli(subcommand, scriptRel, args) {
  return new Promise((resolve, reject) => {
    (async () => {
      const runtime = resolveCipherRuntime();
      let command;
      let commandArgs;

      if (runtime) {
        command = runtime;
        commandArgs = [subcommand, ...args];
      } else {
        const script = await resolveEidolonScript(scriptRel);
        if (!script) {
          reject(
            new Error(
              `Eidolon introuvable (ni cipher-runtime, ni ${path.basename(scriptRel)}). ` +
                'Rebuild Cipher depuis Chimera (Eidolon à côté de Cipher), ou définissez EIDOLON_ROOT ' +
                'vers un checkout Eidolon complet, avec Python 3 et eidolon_crypto installés.',
            ),
          );
          return;
        }
        command = resolveEidolonPython();
        commandArgs = [script, ...args];
      }

      const eidolonRoot = await resolveEidolonRoot();
      const dataDir = getEidolonDataDir();
      const child = spawn(command, commandArgs, {
        cwd: runtime ? path.dirname(runtime) : eidolonRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          ...(eidolonRoot ? { EIDOLON_ROOT: eidolonRoot } : {}),
          ...(dataDir ? { EIDOLON_DATA_DIR: dataDir } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdoutChunks = [];
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (d) => { stdoutChunks.push(d); });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks);
        for (const chunk of stdoutChunks) {
          if (chunk !== stdout) chunk.fill(0);
        }
        stdoutChunks.length = 0;
        resolve({ stdout, stderr, code: code ?? -1 });
      });
    })().catch(reject);
  });
}

async function runKeybundleCli(args) {
  const result = await runCipherRuntimeCli('keybundle', KEYBUNDLE_CLI_REL, args);
  return { ...result, stdout: result.stdout.toString('utf8') };
}

async function mirrorBridgeContextToUserData(bridgePath) {
  if (!bridgePath || !existsSync(bridgePath)) return;
  const dest = path.join(app.getPath('userData'), VAULT_BRIDGE_FILE);
  try {
    const raw = await fs.readFile(bridgePath, 'utf8');
    await fs.writeFile(dest, raw, 'utf8');
  } catch (err) {
    console.warn('[keybundle] Failed to mirror bridge context to userData:', err);
  }
}

function mapKeybundleImportPayload(payload) {
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

async function importVaultKeybundleLocal(bundleBytes) {
  const buf = Buffer.isBuffer(bundleBytes) ? bundleBytes : Buffer.from(bundleBytes);
  if (!buf.length || buf.length > 5 * 1024 * 1024) {
    return { ok: false, error: `bundle size out of range (${buf.length} bytes)` };
  }

  const tmpDir = path.join(os.tmpdir(), `cipher-keybundle-${randomBytes(6).toString('hex')}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, 'incoming.eidolon_keybundle');
  writeFileSync(tmpPath, buf);

  try {
    const result = await runKeybundleCli(['import', '--bundle', tmpPath]);
    const payload = parseKeybundleCliJson(result.stdout);
    if (result.code !== 0 || !payload || payload.ok !== true) {
      const detail = payload?.error || result.stderr.slice(-500) || `exit ${result.code}`;
      return { ok: false, error: `keybundle import failed: ${detail}` };
    }
    await mirrorBridgeContextToUserData(String(payload.bridge_path ?? ''));
    return mapKeybundleImportPayload(payload);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'keybundle import failed',
    };
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

async function exportVaultKeybundleLocal(vaultId) {
  const id = String(vaultId ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{4,64}$/i.test(id)) {
    return { ok: false, error: 'invalid vaultId' };
  }

  const tmpDir = path.join(os.tmpdir(), `cipher-keybundle-${randomBytes(6).toString('hex')}`);
  mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, `${id}.eidolon_keybundle`);

  try {
    const result = await runKeybundleCli(['export', '--vault-id', id, '--output', outPath]);
    const payload = parseKeybundleCliJson(result.stdout);
    if (result.code !== 0 || !payload || payload.ok !== true) {
      const detail = payload?.error || result.stderr.slice(-500) || `exit ${result.code}`;
      return { ok: false, error: `keybundle export failed: ${detail}` };
    }
    const bundlePath = String(payload.bundle_path ?? outPath);
    if (!existsSync(bundlePath)) {
      return { ok: false, error: 'bundle file missing after export' };
    }
    const bytes = await fs.readFile(bundlePath);
    try { unlinkSync(bundlePath); } catch { /* ignore */ }
    // Hand out a copy and scrub the Buffer we read from disk: the bundle is
    // the vault in clear (.psnx + companion), it must not linger in the pool.
    const copy = new Uint8Array(bytes);
    bytes.fill(0);
    return {
      ok: true,
      bytes: copy,
      filename: `vault_${String(payload.vault_name ?? id).replace(/[^A-Za-z0-9_-]/g, '_')}.eidolon_keybundle`,
      vaultId: String(payload.vault_id ?? id),
      vaultName: String(payload.vault_name ?? ''),
      sha256: String(payload.sha256 ?? ''),
      size: bytes.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'keybundle export failed',
    };
  }
}

async function readVaultBridgeContext() {
  for (const candidate of getVaultBridgeCandidates()) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const context = JSON.parse(raw);
      if (!context || typeof context !== 'object') {
        continue;
      }

      const eidolonRoot = await resolveEidolonRoot();
      if (eidolonRoot) {
        try {
          const registryPath = path.join(eidolonRoot, 'data', 'vaults', 'identities', 'vault_registry.json');
          const rawRegistry = await fs.readFile(registryPath, 'utf8');
          const registry = JSON.parse(rawRegistry);
          const vaults = registry?.vaults && typeof registry.vaults === 'object' ? registry.vaults : {};
          const bridgeVaultId =
            typeof context.vault_id === 'string' && context.vault_id.trim() ? context.vault_id.trim() : null;

          if (bridgeVaultId && Object.keys(vaults).length > 0 && !vaults[bridgeVaultId]) {
            return {
              ok: false,
              path: candidate,
              error: 'Vault bridge context is stale and no longer matches the current Eidolon vault registry.',
            };
          }
        } catch {
          // If the current registry cannot be read, fall back to the bridge payload.
        }
      }

      // Compute SHA-256 of .psnx file for desktop bridge proof
      // Try the path from bridge JSON first, fall back to user file picker
      let psnxResolved = false;
      if (typeof context.psnx_path === 'string' && context.psnx_path.trim()) {
        try {
          const psnxBuffer = readFileSync(context.psnx_path);
          context.psnx_hash = createHash('sha256').update(psnxBuffer).digest('hex');
          psnxResolved = true;
        } catch {
          // File moved or deleted — will prompt user below
        }
      }
      context._psnx_resolved = psnxResolved;

      return { ok: true, path: candidate, context };
    } catch {
      // Try next candidate.
    }
  }

  return { ok: false, error: 'Vault bridge context not found.' };
}

// --- Vault file sources (allowlist) -------------------------------------------
// The renderer never names a path. It asks for a file *kind* and the source is
// resolved here from three local origins, in priority order:
//   1. the Eidolon vault registry (`vault_registry.json`) — authoritative, and
//      robust to a stale bridge JSON, which readVaultBridgeContext already
//      knows how to detect;
//   2. the bridge JSON written at the end of the ceremony (`psnx_path` and
//      `blend_path`);
//   3. the .psnx the user last picked in the native file dialog.
// The companion is `.blend` when Blender is present, `.blend_data` otherwise.

const VAULT_FILE_EXTENSIONS = {
  psnx: new Set(['.psnx']),
  blend: new Set(['.blend', '.blend_data']),
};

function isVaultFileOfKind(kind, absPath) {
  const allowed = VAULT_FILE_EXTENSIONS[kind];
  return Boolean(allowed && allowed.has(path.extname(absPath).toLowerCase()));
}

function addVaultFileCandidate(candidates, kind, value) {
  if (typeof value !== 'string' || !value.trim()) return;
  const resolved = path.resolve(value.trim());
  if (!isVaultFileOfKind(kind, resolved)) return;
  if (!candidates[kind].includes(resolved)) candidates[kind].push(resolved);
}

// Synchronous origins only (bridge JSON files + last user-picked .psnx).
function collectBridgeVaultFileCandidates() {
  const candidates = { psnx: [], blend: [], vaultIds: [] };
  if (lastSelectedPsnxPath) addVaultFileCandidate(candidates, 'psnx', lastSelectedPsnxPath);
  for (const candidate of getVaultBridgeCandidates()) {
    try {
      const context = JSON.parse(readFileSync(candidate, 'utf8'));
      if (!context || typeof context !== 'object') continue;
      addVaultFileCandidate(candidates, 'psnx', context.psnx_path);
      addVaultFileCandidate(candidates, 'blend', context.blend_path);
      if (typeof context.vault_id === 'string' && context.vault_id.trim()) {
        candidates.vaultIds.push(context.vault_id.trim());
      }
    } catch {
      // ignore missing or malformed context
    }
  }
  return candidates;
}

function pickRegistryVaultEntry(vaults, vaultRef) {
  const entries = Object.entries(vaults).filter(([, entry]) => entry && typeof entry === 'object');
  if (entries.length === 0) return null;
  for (const id of vaultRef.vaultIds ?? []) {
    if (vaults[id] && typeof vaults[id] === 'object') return vaults[id];
  }
  if (vaultRef.vaultNumber !== undefined && vaultRef.vaultNumber !== null) {
    const byNumber = entries.find(([, entry]) => entry.vault_number === vaultRef.vaultNumber);
    if (byNumber) return byNumber[1];
  }
  if (entries.length === 1) return entries[0][1];
  // Several vaults and no usable hint: the most recently created one.
  entries.sort(([, a], [, b]) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return entries[0][1];
}

async function readVaultRegistryEntry(vaultRef = {}) {
  const registryPaths = new Set();
  const eidolonRoot = await resolveEidolonRoot();
  if (eidolonRoot) {
    registryPaths.add(path.join(eidolonRoot, 'data', 'vaults', 'identities', 'vault_registry.json'));
  }
  const dataDir = getEidolonDataDir();
  if (dataDir) {
    registryPaths.add(path.join(dataDir, 'data', 'vaults', 'identities', 'vault_registry.json'));
  }
  for (const registryPath of registryPaths) {
    try {
      const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
      const vaults = registry?.vaults && typeof registry.vaults === 'object' ? registry.vaults : {};
      const entry = pickRegistryVaultEntry(vaults, vaultRef);
      if (entry) return entry;
    } catch {
      // missing or unreadable registry: try the next location
    }
  }
  return null;
}

/**
 * Resolve the on-disk sources of the vault files for this device.
 * Returns `{ psnx?: absPath, blend?: absPath }` — main-process use only, the
 * paths carry the OS account name and must never reach the renderer or a log.
 */
async function resolveVaultFileSources(vaultRef = {}) {
  const bridge = collectBridgeVaultFileCandidates();
  const ordered = { psnx: [], blend: [] };

  const ids = [];
  if (typeof vaultRef.vaultId === 'string' && vaultRef.vaultId.trim()) ids.push(vaultRef.vaultId.trim());
  ids.push(...bridge.vaultIds);
  const entry = await readVaultRegistryEntry({ ...vaultRef, vaultIds: ids });
  if (entry) {
    addVaultFileCandidate(ordered, 'psnx', entry.psnx_path);
    addVaultFileCandidate(ordered, 'blend', entry.blend_path);
  }
  for (const kind of ['psnx', 'blend']) {
    for (const candidate of bridge[kind]) addVaultFileCandidate(ordered, kind, candidate);
  }

  const sources = {};
  for (const kind of ['psnx', 'blend']) {
    const found = ordered[kind].find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (found) sources[kind] = found;
  }
  return sources;
}

function getAllowedPsnxPaths() {
  return new Set(collectBridgeVaultFileCandidates().psnx);
}

// --- Genesis ceremony (local Eidolon Python CLI) -----------------------------
// The ceremony mints the user's master seed and writes the .psnx/.blend vault
// files on THIS machine. It must never run server-side: the bridge's
// /api/v2/auth/genesis-stream route exists for localhost dev only, and the
// hosted bridge has no Python (`spawn python3 ENOENT`). Packaged Cipher loads
// from file://, so an EventSource on a root-relative URL would resolve to
// file:///api/... and never leave the renderer. Both problems disappear by
// spawning the CLI here and streaming its JSON lines over IPC.
//
// Mirrors the SSE contract of apps/bridge/src/routes/genesis.ts so
// GenesisAnimation can consume either transport unchanged:
//   'phase' -> one JSON object per ceremony phase / progress tick
//   'log'   -> non-JSON stdout line
//   'done'  -> exit 0
//   'error' -> spawn failure or non-zero exit (with stderr tail)
const GENESIS_CLI_REL = path.join('src', 'crypto', 'vault_auto_provision.py');
const GENESIS_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;
const genesisRuns = new Map();
let genesisSeq = 0;

async function resolveGenesisRoot() {
  const root = await resolveEidolonRoot();
  if (!root) return null;
  return existsSync(path.join(root, GENESIS_CLI_REL)) ? root : null;
}

function stopGenesisRun(runId) {
  const run = genesisRuns.get(runId);
  if (!run) return false;
  genesisRuns.delete(runId);
  try {
    if (!run.child.killed) run.child.kill('SIGTERM');
  } catch {
    // already gone
  }
  return true;
}

async function startGenesisCeremony(event, rawName) {
  const name = String(rawName ?? '').trim();
  if (!GENESIS_NAME_REGEX.test(name)) {
    return {
      ok: false,
      error: 'invalid_name',
      message: 'name must be 1-64 chars, alnum + space/underscore/dash',
    };
  }

  // Prefer the frozen runtime; fall back to the Python source tree.
  const runtime = resolveCipherRuntime();
  const eidolonRoot = runtime ? await resolveEidolonRoot() : await resolveGenesisRoot();

  if (!runtime && !eidolonRoot) {
    return {
      ok: false,
      error: 'eidolon_missing',
      message:
        "Runtime Eidolon introuvable (ni cipher-runtime, ni src/crypto/vault_auto_provision.py). " +
        "Réinstallez Cipher, ou définissez EIDOLON_ROOT vers un checkout Eidolon complet.",
    };
  }

  const dataDir = getEidolonDataDir();
  const runId = `genesis-${++genesisSeq}`;
  const sender = event.sender;

  // The frozen binary carries its own interpreter and source, so it needs
  // neither a source tree as cwd nor EIDOLON_ROOT. It DOES need
  // EIDOLON_DATA_DIR, which is now non-null on every platform: without it
  // config/paths falls back to the executable's own directory, unwritable
  // inside an AppImage.
  const command = runtime || resolveEidolonPython();
  const commandArgs = runtime
    ? ['ceremony', '--name', name, '--json']
    : ['-m', 'src.crypto.vault_auto_provision', '--name', name, '--json'];
  const spawnCwd = runtime ? path.dirname(runtime) : eidolonRoot;

  let child;
  try {
    child = spawn(command, commandArgs, {
      cwd: spawnCwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...(eidolonRoot ? { EIDOLON_ROOT: eidolonRoot } : {}),
        ...(dataDir ? { EIDOLON_DATA_DIR: dataDir } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return { ok: false, error: 'spawn_failed', message: String(err?.message || err) };
  }

  genesisRuns.set(runId, { child, sender });

  const emit = (kind, payload) => {
    if (sender.isDestroyed()) return;
    sender.send('genesis:event', { runId, event: kind, data: payload });
  };

  emit('hello', { ceremony: 'genesis', name, started_at: new Date().toISOString() });

  let stdoutBuf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      try {
        emit('phase', JSON.parse(line));
      } catch {
        emit('log', { line });
      }
    }
  });

  let stderrBuf = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
  });

  child.on('error', (err) => {
    genesisRuns.delete(runId);
    emit('error', { message: err.message });
  });

  child.on('close', (code) => {
    genesisRuns.delete(runId);
    if (code === 0) {
      emit('done', { code });
    } else {
      emit('error', { code, stderr: stderrBuf.slice(-2000) });
    }
  });

  // The ceremony writes vault files; a reload or window close must not leave
  // an orphaned Python process holding the keys directory.
  sender.once('destroyed', () => stopGenesisRun(runId));

  return { ok: true, runId };
}

ipcMain.handle('genesis:start', async (event, name) => {
  requireTrustedRenderer(event);
  return startGenesisCeremony(event, name);
});

ipcMain.handle('genesis:cancel', async (event, runId) => {
  requireTrustedRenderer(event);
  return { ok: stopGenesisRun(String(runId || '')) };
});

ipcMain.handle('vault-bridge:get-context', async (event) => {
  requireTrustedRenderer(event);
  return readVaultBridgeContext();
});

ipcMain.handle('keybundle:import', async (event, bundleBytes) => {
  requireTrustedRenderer(event);
  return importVaultKeybundleLocal(bundleBytes);
});

ipcMain.handle('keybundle:export', async (event, vaultId) => {
  requireTrustedRenderer(event);
  return exportVaultKeybundleLocal(vaultId);
});

ipcMain.handle('vault-bridge:select-psnx', async (event) => {
  requireTrustedRenderer(event);
  const { dialog } = electron;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select your .psnx vault file',
    filters: [{ name: 'PSNX Vault Key', extensions: ['psnx'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, error: 'No file selected' };
  }
  const selectedPath = result.filePaths[0];
  try {
    lastSelectedPsnxPath = path.resolve(selectedPath);
    const psnxBuffer = readFileSync(selectedPath);
    const psnxHash = createHash('sha256').update(psnxBuffer).digest('hex');
    return { ok: true, psnxPath: selectedPath, psnxHash };
  } catch (err) {
    return { ok: false, error: 'Cannot read the selected file' };
  }
});

ipcMain.handle('vault-bridge:read-psnx', async (event, psnxPath) => {
  requireTrustedRenderer(event);
  if (typeof psnxPath !== 'string' || !psnxPath.trim()) {
    return { ok: false, error: 'psnxPath is required' };
  }
  try {
    const resolvedPath = path.resolve(psnxPath.trim());
    if (path.extname(resolvedPath).toLowerCase() !== '.psnx') {
      return { ok: false, error: 'Only .psnx files can be read' };
    }
    if (!getAllowedPsnxPaths().has(resolvedPath)) {
      return { ok: false, error: 'PSNX path is not allowed' };
    }
    const buf = readFileSync(resolvedPath);
    return { ok: true, base64: buf.toString('base64'), hash: createHash('sha256').update(buf).digest('hex') };
  } catch (err) {
    return { ok: false, error: 'Cannot read PSNX file at the specified path' };
  }
});

// --- Vault file handover (end of ceremony) -----------------------------------
// Four channels behind the GenesisHandover screen. Non-negotiable rules:
//   - the renderer sends a file *kind*, never a path (a `saveFile(src, dst)`
//     channel would be an arbitrary copy primitive for any renderer XSS);
//   - the destination comes exclusively from a native dialog;
//   - copies never overwrite (COPYFILE_EXCL / 'wx'), an existing file is
//     reported as skipped, not treated as an error that aborts the rest;
//   - the keybundle bytes are written here and scrubbed, they never cross IPC;
//   - no reply carries an absolute path (it contains the OS account name) or
//     file contents — only filename, size and sha256.

function stripAbsolutePaths(message) {
  return String(message ?? '')
    .replace(/[A-Za-z]:[\\/](?:[^\\/\s'"<>|]+[\\/])*[^\\/\s'"<>|]*/g, '<path>')
    .replace(/\/(?:[^/\s'"<>|]+\/)+[^/\s'"<>|]*/g, '<path>');
}

async function digestVaultFile(absPath) {
  const buf = await fs.readFile(absPath);
  try {
    return { size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  } finally {
    buf.fill(0);
  }
}

async function showVaultFilesDialog(method, options) {
  const { dialog } = electron;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  return parent ? dialog[method](parent, options) : dialog[method](options);
}

ipcMain.handle('vault-files:list', async (event) => {
  requireTrustedRenderer(event);
  try {
    const sources = await resolveVaultFileSources();
    const files = [];
    for (const kind of ['psnx', 'blend']) {
      const src = sources[kind];
      if (!src) continue;
      try {
        const { size, sha256 } = await digestVaultFile(src);
        files.push({ kind, filename: path.basename(src), size, sha256 });
      } catch {
        // Unreadable file: leave it out rather than fail the whole list.
      }
    }
    return { ok: true, files };
  } catch (err) {
    return { ok: false, files: [], error: stripAbsolutePaths(err?.message ?? 'list_failed') };
  }
});

ipcMain.handle('vault-files:save-copies', async (event, payload) => {
  requireTrustedRenderer(event);
  const requested = Array.isArray(payload?.kinds) ? payload.kinds : [];
  const kinds = [...new Set(requested.filter((kind) => kind === 'psnx' || kind === 'blend'))];
  if (kinds.length === 0) {
    return { ok: false, saved: [], error: 'invalid_kinds' };
  }

  let sources;
  try {
    sources = await resolveVaultFileSources();
  } catch (err) {
    return { ok: false, saved: [], error: stripAbsolutePaths(err?.message ?? 'resolve_failed') };
  }

  const skipped = [];
  const plan = [];
  for (const kind of kinds) {
    if (sources[kind]) plan.push({ kind, src: sources[kind] });
    else skipped.push({ kind, filename: '', reason: 'missing' });
  }
  if (plan.length === 0) {
    return { ok: false, saved: [], skipped, error: 'no_sources' };
  }

  const strings = getTrayStrings();
  const picked = await showVaultFilesDialog('showOpenDialog', {
    title: strings.vaultFilesDirTitle,
    buttonLabel: strings.vaultFilesDirButton,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths?.[0]) {
    return { ok: false, saved: [], skipped: skipped.length ? skipped : undefined, error: 'canceled' };
  }
  const destDir = picked.filePaths[0];

  const saved = [];
  for (const { kind, src } of plan) {
    const filename = path.basename(src);
    const dst = path.join(destDir, filename);
    try {
      await fs.copyFile(src, dst, fsConstants.COPYFILE_EXCL);
      const { size, sha256 } = await digestVaultFile(dst);
      saved.push({ kind, filename, size, sha256 });
    } catch (err) {
      skipped.push({ kind, filename, reason: err?.code === 'EEXIST' ? 'exists' : 'copy_failed' });
    }
  }
  return { ok: true, saved, skipped: skipped.length ? skipped : undefined };
});

ipcMain.handle('vault-files:save-keybundle', async (event, vaultId) => {
  requireTrustedRenderer(event);
  const exported = await exportVaultKeybundleLocal(vaultId);
  if (!exported.ok) {
    return { ok: false, error: stripAbsolutePaths(exported.error) };
  }
  const buf = exported.bytes;
  try {
    const picked = await showVaultFilesDialog('showSaveDialog', {
      title: getTrayStrings().vaultKeybundleTitle,
      defaultPath: exported.filename,
      filters: [{ name: 'Eidolon keybundle', extensions: ['eidolon_keybundle'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (picked.canceled || !picked.filePath) {
      return { ok: false, error: 'canceled' };
    }
    const dst = picked.filePath;
    try {
      // 'wx': exclusive create. Overwriting could destroy another vault's identity.
      await fs.writeFile(dst, buf, { flag: 'wx' });
    } catch (err) {
      return { ok: false, error: err?.code === 'EEXIST' ? 'exists' : 'write_failed' };
    }
    return {
      ok: true,
      filename: path.basename(dst),
      size: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
  } finally {
    buf.fill(0);
  }
});

ipcMain.handle('vault-files:reveal', async (event) => {
  requireTrustedRenderer(event);
  try {
    const sources = await resolveVaultFileSources();
    const target = sources.psnx ?? sources.blend;
    if (!target) return { ok: false, error: 'no_sources' };
    shell.showItemInFolder(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: stripAbsolutePaths(err?.message ?? 'reveal_failed') };
  }
});

// --- Vault → E2EE seed (contract v1) -----------------------------------------
// A vault-native Cipher account has no mnemonic: its masterKeyHex is the seed
// the Eidolon runtime derives from the .psnx (`cipher-runtime e2ee-seed
// derive --psnx <path>`, spec: cipher-e2ee/SPEC_VAULT_E2EE_SEED_V1.md). The
// runtime prints one JSON line:
//   {"ok":true,"version":"v1","key_id":"…","vault_id":"<64 hex>","e2ee_seed_hex":"<64 hex>"}
//   {"ok":false,"error":"…","error_code":"…"}
// Rules, on top of the vault-files ones above:
//   - the renderer names a vault id, never a path: the .psnx is resolved here
//     from the bridge context / Eidolon registry (resolveVaultFileSources);
//   - the seed is a secret: it crosses IPC once, is never logged and never
//     written to disk here, and every Buffer that held it is zeroed;
//   - the vault id the runtime recomputes from the file must be the one the
//     renderer asked for, otherwise the wrong vault would root the account.
const E2EE_SEED_CLI_REL = path.join('scripts', 'public', 'e2ee_seed_cli.py');
const VAULT_ID_REGEX = /^[a-f0-9]{4,64}$/;
const HEX64_REGEX = /^[0-9a-f]{64}$/;

/**
 * Parse the last JSON line of a stdout Buffer without keeping a string copy
 * of the whole output around. Returns null when no line parses.
 */
function parseLastJsonLineFromBuffer(buf) {
  let end = buf.length;
  while (end > 0) {
    const start = buf.lastIndexOf(0x0a, end - 1);
    const line = buf.subarray(start + 1, end).toString('utf8').trim();
    if (line) {
      try {
        return JSON.parse(line);
      } catch {
        // non-JSON line (Python warning, progress), keep scanning upwards
      }
    }
    if (start < 0) break;
    end = start;
  }
  return null;
}

async function deriveVaultE2eeSeedLocal(vaultId) {
  const requestedId = String(vaultId ?? '').trim().toLowerCase();
  if (!VAULT_ID_REGEX.test(requestedId)) {
    return { ok: false, error: 'invalid vaultId', errorCode: 'invalid_vault_id' };
  }

  let sources;
  try {
    sources = await resolveVaultFileSources({ vaultId: requestedId });
  } catch (err) {
    return {
      ok: false,
      error: stripAbsolutePaths(err?.message ?? 'resolve_failed'),
      errorCode: 'resolve_failed',
    };
  }
  if (!sources.psnx) {
    return { ok: false, error: 'PSNX file not found on this device', errorCode: 'psnx_not_found' };
  }

  let result;
  try {
    result = await runCipherRuntimeCli('e2ee-seed', E2EE_SEED_CLI_REL, ['derive', '--psnx', sources.psnx]);
  } catch (err) {
    return {
      ok: false,
      error: stripAbsolutePaths(err?.message ?? 'runtime_unavailable'),
      errorCode: 'runtime_unavailable',
    };
  }

  const stdout = result.stdout;
  let payload;
  try {
    payload = parseLastJsonLineFromBuffer(stdout);
  } finally {
    // The only copy of the seed outside the parsed object.
    stdout.fill(0);
  }

  if (result.code !== 0 || !payload || payload.ok !== true) {
    const detail = payload?.error || result.stderr.slice(-500) || `exit ${result.code}`;
    return {
      ok: false,
      error: stripAbsolutePaths(`e2ee seed derivation failed: ${detail}`),
      errorCode: typeof payload?.error_code === 'string' ? payload.error_code : 'derivation_failed',
    };
  }

  const resolvedId = String(payload.vault_id ?? '').trim().toLowerCase();
  const masterKeyHex = String(payload.e2ee_seed_hex ?? '').trim().toLowerCase();
  if (payload.version !== 'v1' || !HEX64_REGEX.test(resolvedId) || !HEX64_REGEX.test(masterKeyHex)) {
    return { ok: false, error: 'malformed runtime reply', errorCode: 'malformed_reply' };
  }
  if (resolvedId !== requestedId) {
    return { ok: false, error: 'vault_mismatch', errorCode: 'vault_mismatch' };
  }

  return {
    ok: true,
    keyId: String(payload.key_id ?? ''),
    vaultId: resolvedId,
    masterKeyHex,
  };
}

ipcMain.handle('vault-e2ee:derive-seed', async (event, payload) => {
  requireTrustedRenderer(event);
  return deriveVaultE2eeSeedLocal(payload?.vaultId);
});

// --- Sphere custody client (Eidolon I4) ---------------------------------------
// The vault's spheres live in a custody ledger anchored on the Eidolon VPS.
// The client is `cipher-runtime sphere …` (scripts/public/sphere_cli.py):
// one JSON line per call, {"ok":true,…} or {"ok":false,"error","error_code"}.
// Rules, on top of the e2ee-seed ones above:
//   - the renderer names a vault id, never a path: the .psnx is resolved here
//     and handed to the runtime with --psnx; a sphere file carries no secret,
//     but the .psnx path never crosses IPC;
//   - import/export destinations come from native dialogs; replies carry
//     filename / size only;
//   - the runtime already refuses what must be refused (a file that is not
//     the vault's, an uncontrolled key, a fork, a second signature for one
//     head): main only transports its verdict.
const SPHERE_CLI_REL = path.join('scripts', 'public', 'sphere_cli.py');
const SPHERE_ID_REGEX = /^[A-Za-z0-9_\-]{1,80}$/;
const SPHERE_SUBCOMMANDS = new Set(['list', 'claim', 'transfer', 'import', 'export', 'sync', 'mailbox']);

/**
 * Run one `sphere` subcommand for `vaultId` and return its JSON reply with
 * every absolute path stripped. `extraArgs` are appended after the
 * subcommand; `--psnx` and, when known, `--api` are added here.
 * @param {unknown} vaultId
 * @param {string} subcommand
 * @param {string[]} [extraArgs]
 * @param {{ apiUrl?: unknown }} [options]
 */
async function runSphereCli(vaultId, subcommand, extraArgs = [], { apiUrl } = {}) {
  if (!SPHERE_SUBCOMMANDS.has(subcommand)) {
    return { ok: false, error: 'unknown sphere subcommand', errorCode: 'invalid_input' };
  }
  const requestedId = String(vaultId ?? '').trim().toLowerCase();
  if (!VAULT_ID_REGEX.test(requestedId)) {
    return { ok: false, error: 'invalid vaultId', errorCode: 'invalid_vault_id' };
  }
  let sources;
  try {
    sources = await resolveVaultFileSources({ vaultId: requestedId });
  } catch (err) {
    return { ok: false, error: stripAbsolutePaths(err?.message ?? 'resolve_failed'), errorCode: 'resolve_failed' };
  }
  if (!sources.psnx) {
    return { ok: false, error: 'PSNX file not found on this device', errorCode: 'psnx_not_found' };
  }
  const args = [subcommand, ...extraArgs, '--psnx', sources.psnx];
  const online = !['list', 'export'].includes(subcommand);
  const api = typeof apiUrl === 'string' && /^https?:\/\//.test(apiUrl) ? apiUrl.replace(/\/+$/, '') : null;
  if (online && api) args.push('--api', api);

  let result;
  try {
    result = await runCipherRuntimeCli('sphere', SPHERE_CLI_REL, args);
  } catch (err) {
    return { ok: false, error: stripAbsolutePaths(err?.message ?? 'runtime_unavailable'), errorCode: 'runtime_unavailable' };
  }
  const payload = parseLastJsonLineFromBuffer(result.stdout);
  if (!payload || typeof payload !== 'object') {
    const detail = result.stderr.slice(-500) || `exit ${result.code}`;
    return { ok: false, error: stripAbsolutePaths(`sphere ${subcommand} failed: ${detail}`), errorCode: 'runtime_failed' };
  }
  if (payload.ok !== true) {
    return {
      ok: false,
      error: stripAbsolutePaths(String(payload.error ?? `exit ${result.code}`)),
      errorCode: typeof payload.error_code === 'string' ? payload.error_code : 'sphere_failed',
      sphereId: typeof payload.sphere_id === 'string' ? payload.sphere_id : undefined,
    };
  }
  if (typeof payload.out === 'string') payload.out = path.basename(payload.out);
  const resolvedId = String(payload.vault_id ?? '').trim().toLowerCase();
  if (resolvedId && resolvedId !== requestedId) {
    return { ok: false, error: 'vault_mismatch', errorCode: 'vault_mismatch' };
  }
  return payload;
}

ipcMain.handle('sphere:list', async (event, payload) => {
  requireTrustedRenderer(event);
  return runSphereCli(payload?.vaultId, 'list');
});

ipcMain.handle('sphere:sync', async (event, payload) => {
  requireTrustedRenderer(event);
  return runSphereCli(payload?.vaultId, 'sync', [], { apiUrl: payload?.apiUrl });
});

ipcMain.handle('sphere:claim', async (event, payload) => {
  requireTrustedRenderer(event);
  return runSphereCli(payload?.vaultId, 'claim', [], { apiUrl: payload?.apiUrl });
});

ipcMain.handle('sphere:mailbox', async (event, payload) => {
  requireTrustedRenderer(event);
  const count = Number.isInteger(payload?.count) && payload.count > 0 && payload.count <= 16 ? payload.count : 8;
  return runSphereCli(payload?.vaultId, 'mailbox', ['--count', String(count)], { apiUrl: payload?.apiUrl });
});

ipcMain.handle('sphere:transfer', async (event, payload) => {
  requireTrustedRenderer(event);
  const sphereId = String(payload?.sphereId ?? '').trim();
  const to = String(payload?.to ?? '').trim().toLowerCase();
  if (!SPHERE_ID_REGEX.test(sphereId)) {
    return { ok: false, error: 'invalid sphereId', errorCode: 'invalid_input' };
  }
  if (!HEX64_REGEX.test(to)) {
    return { ok: false, error: 'recipient must be a 64-hex vault id', errorCode: 'invalid_input' };
  }
  return runSphereCli(payload?.vaultId, 'transfer', ['--sphere', sphereId, '--to', to], { apiUrl: payload?.apiUrl });
});

// Import: the user picks a *.sphere.json; the runtime verifies it offline,
// checks it is this vault's and that a key of this vault controls the head,
// then confronts the anchor. The reply carries the verdict, never the path.
ipcMain.handle('sphere:import', async (event, payload) => {
  requireTrustedRenderer(event);
  const picked = await showVaultFilesDialog('showOpenDialog', {
    title: 'Eidolon sphere',
    filters: [{ name: 'Eidolon sphere', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || !picked.filePaths?.length) {
    return { ok: false, error: 'canceled', errorCode: 'canceled' };
  }
  const src = picked.filePaths[0];
  let stat;
  try {
    stat = statSync(src);
  } catch {
    return { ok: false, error: 'file not found', errorCode: 'not_found' };
  }
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) {
    return { ok: false, error: 'not a sphere file', errorCode: 'invalid_input' };
  }
  const result = await runSphereCli(payload?.vaultId, 'import', ['--file', src], { apiUrl: payload?.apiUrl });
  return result.ok ? { ...result, filename: path.basename(src) } : result;
});

// Export: the runtime writes the sphere file (with a pending signed transfer
// if there is one) where the user chose. Reply: filename and size only.
ipcMain.handle('sphere:export', async (event, payload) => {
  requireTrustedRenderer(event);
  const sphereId = String(payload?.sphereId ?? '').trim();
  if (!SPHERE_ID_REGEX.test(sphereId)) {
    return { ok: false, error: 'invalid sphereId', errorCode: 'invalid_input' };
  }
  const picked = await showVaultFilesDialog('showSaveDialog', {
    title: 'Eidolon sphere',
    defaultPath: `${sphereId}.sphere.json`,
    filters: [{ name: 'Eidolon sphere', extensions: ['json'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (picked.canceled || !picked.filePath) {
    return { ok: false, error: 'canceled', errorCode: 'canceled' };
  }
  const result = await runSphereCli(payload?.vaultId, 'export', ['--sphere', sphereId, '--out', picked.filePath]);
  if (!result.ok) return result;
  let size = 0;
  try {
    size = statSync(picked.filePath).size;
  } catch {
    // the runtime reported success; size is informative only
  }
  return { ok: true, sphereId, state: result.state, filename: path.basename(picked.filePath), size };
});

// --- Escrow Nexus (Eidolon escrow_7d) ---------------------------------------
// Sealed, time-locked documents bound to the vault key, kept on this device
// in the same store as the Eidolon launcher's own escrow menu. The client is
// `cipher-runtime escrow …` (scripts/public/escrow_cli.py, runtime ≥ 1.3.0):
// one JSON line per call, {"ok":true,…} or {"ok":false,"error","error_code"}.
// Same rules as `sphere` above, plus one: the document never crosses IPC —
// it enters the runtime as a file the user picked (native open dialog) and
// comes back as a file the user chose (native save dialog); the renderer
// only ever sees metadata (label, dates, size, verdict). What the protocol
// stores in cleartext (label, conditions, deposit time, size) is what the
// list shows; only the document is encrypted.
const ESCROW_CLI_REL = path.join('scripts', 'public', 'escrow_cli.py');
const ESCROW_ID_REGEX = /^[A-Za-z0-9_\-]{1,80}$/;
const ESCROW_SUBCOMMANDS = new Set(['deposit', 'list', 'show', 'retrieve', 'verify', 'delete']);
const ESCROW_MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const ESCROW_LABEL_MAX = 200;

// One escrow runtime at a time per vault: two writers on the same escrows
// dir would race on the atomic writes. The renderer store serialises its own
// calls; this holds for any caller (a second window, a remount).
/** @type {Map<string, Promise<unknown>>} */
const escrowLocks = new Map();
/**
 * @template T
 * @param {string} vaultId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withEscrowLock(vaultId, fn) {
  const prev = escrowLocks.get(vaultId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  escrowLocks.set(vaultId, next);
  next
    .catch(() => {})
    .finally(() => {
      if (escrowLocks.get(vaultId) === next) escrowLocks.delete(vaultId);
    });
  return next;
}

/**
 * Run one `escrow` subcommand for `vaultId` and return its JSON reply with
 * every absolute path stripped. Serialised per vault: one escrow runtime at
 * a time on a vault's envelopes.
 * @param {unknown} vaultId
 * @param {string} subcommand
 * @param {string[]} [extraArgs]
 */
async function runEscrowCli(vaultId, subcommand, extraArgs = []) {
  if (!ESCROW_SUBCOMMANDS.has(subcommand)) {
    return { ok: false, error: 'unknown escrow subcommand', errorCode: 'invalid_input' };
  }
  const requestedId = String(vaultId ?? '').trim().toLowerCase();
  if (!VAULT_ID_REGEX.test(requestedId)) {
    return { ok: false, error: 'invalid vaultId', errorCode: 'invalid_vault_id' };
  }
  let sources;
  try {
    sources = await resolveVaultFileSources({ vaultId: requestedId });
  } catch (err) {
    return { ok: false, error: stripAbsolutePaths(err?.message ?? 'resolve_failed'), errorCode: 'resolve_failed' };
  }
  if (!sources.psnx) {
    return { ok: false, error: 'PSNX file not found on this device', errorCode: 'psnx_not_found' };
  }
  const args = [subcommand, ...extraArgs, '--psnx', sources.psnx];
  let result;
  try {
    result = await withEscrowLock(requestedId, () => runCipherRuntimeCli('escrow', ESCROW_CLI_REL, args));
  } catch (err) {
    return { ok: false, error: stripAbsolutePaths(err?.message ?? 'runtime_unavailable'), errorCode: 'runtime_unavailable' };
  }
  const payload = parseLastJsonLineFromBuffer(result.stdout);
  if (!payload || typeof payload !== 'object') {
    const detail = result.stderr.slice(-500) || `exit ${result.code}`;
    return { ok: false, error: stripAbsolutePaths(`escrow ${subcommand} failed: ${detail}`), errorCode: 'runtime_failed' };
  }
  if (payload.ok !== true) {
    return {
      ok: false,
      error: stripAbsolutePaths(String(payload.error ?? `exit ${result.code}`)),
      errorCode: typeof payload.error_code === 'string' ? payload.error_code : 'escrow_failed',
      releaseAfter: typeof payload.release_after === 'string' ? payload.release_after : undefined,
    };
  }
  if (typeof payload.path === 'string') payload.path = path.basename(payload.path);
  if (Array.isArray(payload.unreadable)) {
    payload.unreadable = payload.unreadable.map((u) => ({
      escrow_id: String(u?.escrow_id ?? ''),
      error: stripAbsolutePaths(String(u?.error ?? '')),
    }));
  }
  if (Array.isArray(payload.results)) {
    for (const r of payload.results) {
      if (r && typeof r.reason === 'string') r.reason = stripAbsolutePaths(r.reason);
    }
  }
  const resolvedId = String(payload.vault_id ?? '').trim().toLowerCase();
  if (resolvedId && resolvedId !== requestedId) {
    return { ok: false, error: 'vault_mismatch', errorCode: 'vault_mismatch' };
  }
  return payload;
}

/**
 * A `--release-after` value the runtime will accept: ISO 8601 → UTC ISO
 * string; null when absent; undefined when malformed.
 * @param {unknown} value
 */
function normaliseReleaseAfter(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(text)) return undefined;
  const at = new Date(text);
  if (Number.isNaN(at.getTime())) return undefined;
  return at.toISOString();
}

ipcMain.handle('escrow:list', async (event, payload) => {
  requireTrustedRenderer(event);
  return runEscrowCli(payload?.vaultId, 'list');
});

// Deposit: the document is picked here, sealed by the runtime, and never read
// by main. Reply: the new escrow as `list` shows it, plus the file name.
ipcMain.handle('escrow:deposit', async (event, payload) => {
  requireTrustedRenderer(event);
  const releaseAfter = normaliseReleaseAfter(payload?.releaseAfter);
  if (releaseAfter === undefined) {
    return { ok: false, error: 'invalid release date', errorCode: 'invalid_input' };
  }
  const label = payload?.label === undefined || payload?.label === null ? null : String(payload.label).trim();
  if (label !== null && (label.length > ESCROW_LABEL_MAX || /[\r\n]/.test(label))) {
    return { ok: false, error: 'invalid label', errorCode: 'invalid_input' };
  }
  const picked = await showVaultFilesDialog('showOpenDialog', {
    title: 'Escrow Nexus',
    properties: ['openFile'],
  });
  if (picked.canceled || !picked.filePaths?.length) {
    return { ok: false, error: 'canceled', errorCode: 'canceled' };
  }
  const src = picked.filePaths[0];
  let stat;
  try {
    stat = statSync(src);
  } catch {
    return { ok: false, error: 'file not found', errorCode: 'not_found' };
  }
  if (!stat.isFile() || stat.size > ESCROW_MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'not a document, or larger than 64 MiB', errorCode: 'invalid_input' };
  }
  const args = ['--file', src];
  if (label) args.push('--label', label);
  if (releaseAfter) args.push('--release-after', releaseAfter);
  if (payload?.ownerOnly === true) args.push('--owner-only');
  const result = await runEscrowCli(payload?.vaultId, 'deposit', args);
  return result.ok ? { ...result, filename: path.basename(src) } : result;
});

// Retrieve: the runtime verifies, evaluates the conditions and writes the
// document where the user chose; the save dialog already asked about
// overwriting, so the runtime is told so. Reply: file name and size only.
ipcMain.handle('escrow:retrieve', async (event, payload) => {
  requireTrustedRenderer(event);
  const escrowId = String(payload?.escrowId ?? '').trim();
  if (!ESCROW_ID_REGEX.test(escrowId)) {
    return { ok: false, error: 'invalid escrowId', errorCode: 'invalid_input' };
  }
  const suggested = String(payload?.suggestedName ?? '').replace(/[\\/:*?"<>|\r\n]+/g, '_').trim().slice(0, 120);
  const picked = await showVaultFilesDialog('showSaveDialog', {
    title: 'Escrow Nexus',
    defaultPath: suggested || `${escrowId}.bin`,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (picked.canceled || !picked.filePath) {
    return { ok: false, error: 'canceled', errorCode: 'canceled' };
  }
  const result = await runEscrowCli(payload?.vaultId, 'retrieve', ['--id', escrowId, '--out', picked.filePath, '--overwrite']);
  if (!result.ok) return result;
  return { ok: true, escrowId, filename: path.basename(picked.filePath), size: Number(result.size ?? 0) };
});

ipcMain.handle('escrow:verify', async (event, payload) => {
  requireTrustedRenderer(event);
  const escrowId = payload?.escrowId === undefined || payload?.escrowId === null ? '' : String(payload.escrowId).trim();
  if (escrowId && !ESCROW_ID_REGEX.test(escrowId)) {
    return { ok: false, error: 'invalid escrowId', errorCode: 'invalid_input' };
  }
  return runEscrowCli(payload?.vaultId, 'verify', escrowId ? ['--id', escrowId] : []);
});

// Delete is irreversible: the renderer confirms with the user, main passes
// the runtime's own --confirm only when told so.
ipcMain.handle('escrow:delete', async (event, payload) => {
  requireTrustedRenderer(event);
  const escrowId = String(payload?.escrowId ?? '').trim();
  if (!ESCROW_ID_REGEX.test(escrowId)) {
    return { ok: false, error: 'invalid escrowId', errorCode: 'invalid_input' };
  }
  if (payload?.confirm !== true) {
    return { ok: false, error: 'confirmation required', errorCode: 'confirmation_required' };
  }
  return runEscrowCli(payload?.vaultId, 'delete', ['--id', escrowId, '--confirm']);
});

ipcMain.handle('eidolon:open-launcher', async () => launchEidolonLauncher());
ipcMain.handle('eidolon:open-installer', async () => openEidolonInstaller());
ipcMain.handle('eidolon:get-vault-metrics', async (_event, vaultRef) => readEidolonVaultMetrics(vaultRef));
ipcMain.handle('eidolon:connect-probe', async (_event, payload) => probeEidolonConnect(payload));
ipcMain.handle('eidolon:connect-session', async (_event, payload) => createEidolonConnectSession(payload));

// Stripe Checkout opens in the user's default browser, never inside the
// Electron window. Keeping payment UI out of the renderer means the user
// always sees a real address bar with the lock icon when they enter card
// details — Electron has no such affordance, and a phishing variant of the
// same trick would be invisible. We allowlist Stripe's checkout host only.
ipcMain.handle('stripe:open-checkout', async (_event, url) => {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'invalid-url' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'invalid-url' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'invalid-protocol' };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = host === 'checkout.stripe.com' || host.endsWith('.stripe.com');
  if (!allowed) {
    return { ok: false, error: 'host-not-allowed' };
  }
  await shell.openExternal(url);
  return { ok: true };
});

// Secure per-device storage for the RGPD backup export password (encrypted via Electron safeStorage).
const BACKUP_PASSWORD_STORE_FILE = 'backup-passwords.json';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function getBackupPasswordStorePath() {
  return path.join(app.getPath('userData'), BACKUP_PASSWORD_STORE_FILE);
}

async function readBackupPasswordStore() {
  try {
    const raw = await fs.readFile(getBackupPasswordStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 'ENOENT') return {};
    return {};
  }
}

async function writeBackupPasswordStore(store) {
  const filePath = getBackupPasswordStorePath();
  const json = JSON.stringify(store ?? {}, null, 2);
  await fs.writeFile(filePath, json, 'utf8');
}

ipcMain.handle('backup-password:has', async (_event, username) => {
  const key = normalizeUsername(username);
  if (!key) return false;
  const store = await readBackupPasswordStore();
  return Boolean(store[key]);
});

ipcMain.handle('backup-password:get', async (_event, username) => {
  const key = normalizeUsername(username);
  if (!key) return { exists: false };
  const store = await readBackupPasswordStore();
  const encryptedB64 = store[key];
  if (!encryptedB64 || typeof encryptedB64 !== 'string') return { exists: false };

  if (!safeStorage.isEncryptionAvailable()) {
    return { exists: false, error: 'Secure storage is not available on this device.' };
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(encryptedB64, 'base64'));
    return { exists: true, password: decrypted };
  } catch {
    // If decryption fails (e.g. OS key changed), treat as missing and clear entry.
    delete store[key];
    try {
      await writeBackupPasswordStore(store);
    } catch {
      // ignore
    }
    return { exists: false };
  }
});

ipcMain.handle('backup-password:set', async (_event, payload) => {
  const key = normalizeUsername(payload?.username);
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!key) throw new Error('Missing username');
  if (!password) throw new Error('Missing password');

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this device.');
  }

  const encrypted = safeStorage.encryptString(password);
  const encryptedB64 = encrypted.toString('base64');

  const store = await readBackupPasswordStore();
  store[key] = encryptedB64;
  await writeBackupPasswordStore(store);
  return { ok: true };
});

ipcMain.handle('backup-password:clear', async (_event, username) => {
  const key = normalizeUsername(username);
  if (!key) return { ok: true };
  const store = await readBackupPasswordStore();
  delete store[key];
  await writeBackupPasswordStore(store);
  return { ok: true };
});

// ============================================================================
// Stored Bundles — device-local encrypted `.eidolon_keybundle` archives.
// The renderer encrypts the bundle with a user-supplied password before
// calling save, so `main` never sees plaintext vault material.
// ============================================================================

const STORED_BUNDLES_DIR = 'stored_bundles';
const STORED_BUNDLES_INDEX = 'index.json';
const VAULT_ID_RE = /^[a-f0-9]{4,64}$/i;

function storedBundlesDir() {
  const dir = path.join(app.getPath('userData'), STORED_BUNDLES_DIR);
  if (!existsSync(dir)) {
    // mkdirSync, not require('fs'): package.json declares "type": "module", so
    // require is not defined here. This threw ReferenceError on the first
    // stored-bundle save of every fresh install, and stored-bundle:save
    // swallowed it into { ok: false }. Reproduced before fixing.
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function storedBundleFilePath(vaultId) {
  if (typeof vaultId !== 'string' || !VAULT_ID_RE.test(vaultId)) {
    throw new Error('invalid vaultId');
  }
  return path.join(storedBundlesDir(), `${vaultId.toLowerCase()}.enc`);
}

async function readStoredBundlesIndex() {
  try {
    const raw = await fs.readFile(path.join(storedBundlesDir(), STORED_BUNDLES_INDEX), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    return {};
  }
}

async function writeStoredBundlesIndex(index) {
  const p = path.join(storedBundlesDir(), STORED_BUNDLES_INDEX);
  await fs.writeFile(p, JSON.stringify(index, null, 2), 'utf8');
}

ipcMain.handle('stored-bundle:save', async (_event, payload) => {
  try {
    const { vaultId, vaultName, bytes } = payload || {};
    const p = storedBundleFilePath(vaultId);
    // Renderer sends Uint8Array (structuredClone preserves typed arrays).
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (!buf.length || buf.length > 10 * 1024 * 1024) {
      throw new Error(`stored bundle size out of range (${buf.length} bytes)`);
    }
    await fs.writeFile(p, buf);
    const index = await readStoredBundlesIndex();
    index[vaultId.toLowerCase()] = {
      vaultName: typeof vaultName === 'string' ? vaultName : '',
      savedAt: new Date().toISOString(),
      size: buf.length,
    };
    await writeStoredBundlesIndex(index);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});

ipcMain.handle('stored-bundle:load', async (_event, vaultId) => {
  try {
    const p = storedBundleFilePath(vaultId);
    if (!existsSync(p)) return { ok: false, error: 'not found' };
    const buf = await fs.readFile(p);
    // Return as Uint8Array so structuredClone hands the renderer a real typed array.
    return { ok: true, bytes: new Uint8Array(buf) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});

ipcMain.handle('stored-bundle:list', async () => {
  try {
    const index = await readStoredBundlesIndex();
    const entries = Object.entries(index).map(([vaultId, meta]) => ({
      vaultId,
      vaultName: meta?.vaultName ?? '',
      savedAt: meta?.savedAt ?? '',
    }));
    entries.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err), entries: [] };
  }
});

ipcMain.handle('stored-bundle:delete', async (_event, vaultId) => {
  try {
    const p = storedBundleFilePath(vaultId);
    try { await fs.unlink(p); } catch { /* already gone */ }
    const index = await readStoredBundlesIndex();
    delete index[vaultId.toLowerCase()];
    await writeStoredBundlesIndex(index);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
