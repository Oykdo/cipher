import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'url';
import { existsSync, createReadStream, statSync } from 'fs';
import path from 'path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EIDOLON_ROOT = path.resolve(HERE, '../../../../../Eidolon');
const EIDOLON_ROOT = process.env.EIDOLON_ROOT || DEFAULT_EIDOLON_ROOT;
const VIEWERS_DIR = path.join(EIDOLON_ROOT, 'data', 'avatars', 'viewers');

/**
 * Serves the Python-generated canonical Three.js hologram viewer HTML.
 *
 * Files are produced by `render_vault_avatar_viewer()` at ceremony time and
 * named `avatar_<hex>.html`. The route only accepts that naming pattern and
 * re-checks the resolved path stays under VIEWERS_DIR before streaming.
 *
 * GET /api/v2/vault/viewer/:file
 *   200 → text/html (self-contained, no external assets needed)
 *   400 → filename doesn't match the expected pattern
 *   404 → file missing
 */
export async function vaultViewerRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/vault/viewer/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    const m = /^avatar_([a-f0-9]{4,64})\.html$/i.exec(file);
    if (!m) {
      reply.code(400);
      return { error: 'invalid viewer filename' };
    }
    const abs = path.join(VIEWERS_DIR, file);
    if (!abs.startsWith(VIEWERS_DIR)) {
      reply.code(400);
      return { error: 'path traversal rejected' };
    }
    if (!existsSync(abs)) {
      reply.code(404);
      return { error: 'viewer not found' };
    }
    const size = statSync(abs).size;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Length', String(size));
    // Viewer bundles all assets inline, but drop caching headers so a
    // regenerated vault picks up the new state immediately.
    reply.header('Cache-Control', 'no-store');
    return reply.send(createReadStream(abs));
  });
}
