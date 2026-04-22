import electron from 'electron';
const { app, BrowserWindow, ipcMain, safeStorage, shell } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let backendProcess = null;
const VAULT_BRIDGE_FILE = 'eidolon_cipher_bridge.json';

// Load bridge env files so the main process (and child Python subprocesses
// that inherit process.env) see EIDOLON_CONNECT_SESSION_SECRET,
// EIDOLON_SERVER_URL, EIDOLON_API_SECRET, etc.
//
// Priority (first match wins — already-set env vars always take precedence):
//   1. Shell / process env already set
//   2. apps/bridge/.env.production   (baked into the release by CI — holds
//      the production lock-server URL + HMAC secret. Gitignored.)
//   3. apps/bridge/.env              (developer local overrides)
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
loadBridgeEnvFile('.env.production');
loadBridgeEnvFile('.env');
const DEFAULT_EIDOLON_DOWNLOAD_URL =
  process.env.EIDOLON_DOWNLOAD_URL || 'https://github.com/Oykdo/Project_Chimera/releases';
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

function getEidolonRootCandidates() {
  return [
    path.join(__dirname, '..', 'Eidolon'),
    path.join(process.cwd(), '..', 'Eidolon'),
    path.join(process.cwd(), 'Eidolon'),
    path.join(process.resourcesPath, 'Eidolon'),
  ];
}

async function resolveEidolonRoot() {
  return findFirstAccessiblePath(getEidolonRootCandidates());
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
    const registration = await registrationResponse.json().catch(() => ({}));
    if (!registrationResponse.ok) {
      return {
        ok: false,
        baseUrl,
        error: registration?.detail || registration?.error || `Registration HTTP ${registrationResponse.status}`,
      };
    }

    return {
      ok: true,
      baseUrl,
      capabilities,
      registration,
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
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
      await createWindow();
    } catch (error) {
      console.error('Failed to start application:', error);
      app.quit();
    }
  });
}

async function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = app.isPackaged
      ? path.join(process.resourcesPath, 'apps', 'bridge', 'dist', 'index.js')
      : path.join(__dirname, 'apps', 'bridge', 'src', 'index.ts');

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

  // Load app
  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, 'apps', 'frontend', 'dist', 'index.html'));
  } else {
    // Dev mode - load from Vite dev server
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
}

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle IPC if needed
ipcMain.handle('get-app-path', () => app.getPath('userData'));

function getVaultBridgeCandidates() {
  return [
    path.join(__dirname, '..', VAULT_BRIDGE_FILE),
    path.join(process.cwd(), '..', VAULT_BRIDGE_FILE),
    path.join(process.cwd(), VAULT_BRIDGE_FILE),
  ];
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

ipcMain.handle('vault-bridge:get-context', async () => readVaultBridgeContext());

ipcMain.handle('vault-bridge:select-psnx', async () => {
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
    const psnxBuffer = readFileSync(selectedPath);
    const psnxHash = createHash('sha256').update(psnxBuffer).digest('hex');
    return { ok: true, psnxPath: selectedPath, psnxHash };
  } catch (err) {
    return { ok: false, error: 'Cannot read the selected file' };
  }
});

ipcMain.handle('eidolon:open-launcher', async () => launchEidolonLauncher());
ipcMain.handle('eidolon:open-installer', async () => openEidolonInstaller());
ipcMain.handle('eidolon:get-vault-metrics', async (_event, vaultRef) => readEidolonVaultMetrics(vaultRef));
ipcMain.handle('eidolon:connect-probe', async (_event, payload) => probeEidolonConnect(payload));
ipcMain.handle('eidolon:connect-session', async (_event, payload) => createEidolonConnectSession(payload));

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
    require('fs').mkdirSync(dir, { recursive: true });
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
