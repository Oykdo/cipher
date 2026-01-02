import electron from 'electron';
const { app, BrowserWindow, ipcMain, safeStorage } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let backendProcess = null;

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
        PORT: '4000'
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
          port: 4000,
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

  // Security
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
