import type { FastifyInstance } from 'fastify';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { existsSync, createReadStream, readFileSync, unlinkSync, writeFileSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import os from 'os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// routes/ -> src/ -> bridge/ -> apps/ -> Cipher/ -> Chimera/ (5 levels up)
const DEFAULT_EIDOLON_ROOT = path.resolve(HERE, '../../../../../Eidolon');
const EIDOLON_ROOT = process.env.EIDOLON_ROOT || DEFAULT_EIDOLON_ROOT;

// Reuse the same robust Python resolver pattern the genesis route uses so the
// bundle CLI is guaranteed NOT to hit the WindowsApps UWP stub.
function resolvePython(): string {
  if (process.env.EIDOLON_PYTHON && existsSync(process.env.EIDOLON_PYTHON)) {
    return process.env.EIDOLON_PYTHON;
  }
  if (process.platform !== 'win32') {
    for (const abs of ['/usr/bin/python3', '/usr/local/bin/python3']) {
      if (existsSync(abs)) return abs;
    }
    const r = spawnSync('which', ['python3'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n')[0];
    return 'python3';
  }
  const isStub = (p: string) => /WindowsApps/i.test(p) || /AppInstaller/i.test(p);
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
const EIDOLON_PYTHON = resolvePython();

const CLI_SCRIPT = path.join(EIDOLON_ROOT, 'scripts', 'public', 'keybundle_cli.py');
const VAULT_ID_REGEX = /^[a-f0-9]{4,64}$/i;

type CliResult = { stdout: string; stderr: string; code: number };

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(EIDOLON_PYTHON, [CLI_SCRIPT, ...args], {
      cwd: EIDOLON_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.stderr.on('data', (d: string) => { stderr += d; });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

function parseLastJsonLine(stdout: string): Record<string, unknown> | null {
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

export async function vaultKeybundleRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v2/vault/keybundle/export?vaultId=<hex>
   *   200 → application/octet-stream (.eidolon_keybundle binary) + headers
   *   400 → invalid vault_id
   *   500 → CLI failure
   */
  fastify.get('/api/v2/vault/keybundle/export', async (request, reply) => {
    const vaultId = String((request.query as { vaultId?: string }).vaultId ?? '').trim().toLowerCase();
    if (!VAULT_ID_REGEX.test(vaultId)) {
      reply.code(400);
      return { error: 'invalid vaultId' };
    }

    const tmpDir = path.join(os.tmpdir(), `cipher-keybundle-${randomBytes(6).toString('hex')}`);
    mkdirSync(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, `${vaultId}.eidolon_keybundle`);

    let result: CliResult;
    try {
      result = await runCli(['export', '--vault-id', vaultId, '--output', outPath]);
    } catch (err) {
      reply.code(500);
      return { error: `spawn failed: ${String(err)}` };
    }

    const payload = parseLastJsonLine(result.stdout);
    if (result.code !== 0 || !payload || payload.ok !== true || !payload.bundle_path) {
      reply.code(500);
      return {
        error: 'keybundle export failed',
        code: result.code,
        detail: payload ?? result.stderr.slice(-2000),
      };
    }
    const bundlePath = String(payload.bundle_path);
    if (!existsSync(bundlePath)) {
      reply.code(500);
      return { error: 'bundle file missing after export', expected: bundlePath };
    }

    const size = statSync(bundlePath).size;
    const filename = `vault_${String(payload.vault_name ?? vaultId).replace(/[^A-Za-z0-9_-]/g, '_')}.eidolon_keybundle`;
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', String(size));
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('X-Vault-Id', String(payload.vault_id ?? vaultId));
    reply.header('X-Vault-Name', String(payload.vault_name ?? ''));
    reply.header('X-Bundle-Sha256', String(payload.sha256 ?? ''));

    const stream = createReadStream(bundlePath);
    stream.on('close', () => {
      try { unlinkSync(bundlePath); } catch { /* ignore */ }
    });
    return reply.send(stream);
  });

  /**
   * POST /api/v2/vault/keybundle/import
   *   multipart/form-data with field "file" containing the .eidolon_keybundle.
   *   200 → JSON { ok: true, vault_id, vault_number, vault_name, bridge_path, ... }
   *   400 → missing / oversized file
   *   500 → CLI failure
   */
  fastify.post('/api/v2/vault/keybundle/import', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: 'no file uploaded (expected multipart field "file")' };
    }

    const buf = await data.toBuffer();
    // Sanity cap — keybundles are 150-300 KB in practice; 5 MB is a generous ceiling.
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
      reply.code(400);
      return { error: `bundle size out of range (${buf.length} bytes)` };
    }

    const tmpDir = path.join(os.tmpdir(), `cipher-keybundle-${randomBytes(6).toString('hex')}`);
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, 'incoming.eidolon_keybundle');
    writeFileSync(tmpPath, buf);

    let result: CliResult;
    try {
      result = await runCli(['import', '--bundle', tmpPath]);
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      reply.code(500);
      return { error: `spawn failed: ${String(err)}` };
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    const payload = parseLastJsonLine(result.stdout);
    if (result.code !== 0 || !payload || payload.ok !== true) {
      reply.code(500);
      return {
        error: 'keybundle import failed',
        code: result.code,
        detail: payload ?? result.stderr.slice(-2000),
      };
    }
    return payload;
  });
}
