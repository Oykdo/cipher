import type { FastifyInstance } from 'fastify';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// routes/ -> src/ -> bridge/ -> apps/ -> Cipher/ -> Chimera/ (5 levels up), then Eidolon/
const DEFAULT_EIDOLON_ROOT = path.resolve(HERE, '../../../../../Eidolon');

const EIDOLON_ROOT = process.env.EIDOLON_ROOT || DEFAULT_EIDOLON_ROOT;

/**
 * Resolve an absolute path to a real Python interpreter on the host.
 *
 * Windows gotcha: `C:\Users\*\AppData\Local\Microsoft\WindowsApps\python.exe`
 * is a UWP reparse-point stub that redirects to the Microsoft Store installer.
 * Spawning it from a non-interactive context fails with exit code
 * `3221225794` (`STATUS_DLL_INIT_FAILED`) and an empty stderr — the caller
 * sees "error · exit 3221225794 · stderr: ''". We explicitly prune the stub
 * and prefer known install paths over PATH lookup, because bridge processes
 * spawned under tsx/npm can see a user PATH that lists the stub first.
 */
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

  // 1. `where` — filter the UWP stub.
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

  // 2. Known install locations (covers the case where PATH only has the stub).
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const known = [
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Windows\\py.exe',
  ];
  for (const p of known) if (existsSync(p)) return p;

  // 3. Last resort — will fail loudly if the user has no Python at all.
  return 'python.exe';
}

const EIDOLON_PYTHON = resolvePython();
// eslint-disable-next-line no-console
console.log('[genesis] resolved EIDOLON_PYTHON =', EIDOLON_PYTHON, ' EIDOLON_ROOT =', EIDOLON_ROOT);

const NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

/**
 * Genesis ceremony streaming endpoint.
 *
 * GET /api/v2/auth/genesis-stream?name=...
 * -> Server-Sent Events, one event per ceremony phase transition / progress tick.
 *    Each event.data is the JSON payload emitted by
 *    `python -m src.crypto.vault_auto_provision --json`.
 *
 * GET (not POST) so the browser's native EventSource API can consume it.
 * No JWT: the user has no vault yet. Protected by global rate-limit + strict
 * input validation. Should run on localhost only in dev.
 */
export async function genesisRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/auth/genesis-stream', async (request, reply) => {
    const query = (request.query ?? {}) as { name?: string };
    const name = (query.name ?? '').trim();

    if (!NAME_REGEX.test(name)) {
      reply.code(400);
      return { error: 'invalid_name', message: 'name must be 1-64 chars, alnum + space/underscore/dash' };
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, payload: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send('hello', { ceremony: 'genesis', name, started_at: new Date().toISOString() });

    const child = spawn(
      EIDOLON_PYTHON,
      ['-m', 'src.crypto.vault_auto_provision', '--name', name, '--json'],
      {
        cwd: EIDOLON_ROOT,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const keepAlive = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15000);

    let stdoutBuf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          send('phase', parsed);
        } catch {
          send('log', { line });
        }
      }
    });

    let stderrBuf = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuf += chunk;
    });

    const cleanup = () => {
      clearInterval(keepAlive);
      if (!child.killed) child.kill('SIGTERM');
    };

    request.raw.on('close', () => {
      cleanup();
    });

    await new Promise<void>((resolve) => {
      child.on('close', (code) => {
        clearInterval(keepAlive);
        if (code === 0) {
          send('done', { code });
        } else {
          send('error', { code, stderr: stderrBuf.slice(-2000) });
        }
        reply.raw.end();
        resolve();
      });
      child.on('error', (err) => {
        clearInterval(keepAlive);
        send('error', { message: err.message });
        reply.raw.end();
        resolve();
      });
    });
  });
}
