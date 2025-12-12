import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, createWriteStream } from 'fs';
import { getDatabase } from '../db/database.js';

// Shared upload tracking (imported from index.ts)
// These must be exported from index.ts or passed as decorators
const activeUploadsByUser = new Map<string, number>();
const MAX_ACTIVE_UPLOADS_PER_USER = 3;

/**
 * Attachment routes (encrypted client-side)
 * Chunked upload support for large files
 */
export async function attachmentRoutes(fastify: FastifyInstance) {
  // Backwards compatible route prefixes.
  // Historically these routes were mounted at /attachments/*; the v2 API expects /api/v2/attachments/*.
  const ROUTE_PREFIXES = ['/attachments', '/api/v2/attachments'] as const;

  // Helper function to get upload directories
  function getUploadDirs() {
    const dataDir = process.env.BRIDGE_DATA_DIR || './data';
    const uploadDir = join(dataDir, 'uploads');
    const tempDir = join(uploadDir, 'tmp');
    try {
      mkdirSync(uploadDir, { recursive: true });
    } catch {}
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch {}
    return { dataDir, uploadDir, tempDir };
  }

  // ============================================================================
  // CHUNKED UPLOAD ENDPOINTS
  // ============================================================================

  function registerRoutes(prefix: (typeof ROUTE_PREFIXES)[number]) {
    // Initialize chunked upload
    fastify.post(
      `${prefix}/init`,
      { preHandler: fastify.authenticate as any, config: { rateLimit: fastify.uploadLimiter as any } },
      async (request, reply) => {
        const db = getDatabase();
        const userId = (request.user as any).sub as string;
        const { conversationId, filename, mime, size } = request.body as any;

        if (!conversationId || !filename || !mime || !size) {
          reply.code(400);
          return { error: 'conversationId, filename, mime, size requis' };
        }

        const current = activeUploadsByUser.get(userId) || 0;
        if (current >= MAX_ACTIVE_UPLOADS_PER_USER) {
          reply.code(429);
          return { error: "Trop d'uploads actifs" };
        }
        activeUploadsByUser.set(userId, current + 1);

        const convo = await db.getConversationById(conversationId);
        if (!convo) {
          reply.code(404);
          return { error: 'Conversation introuvable' };
        }

        const members = await db.getConversationMembers(conversationId);
        if (!members.includes(userId)) {
          reply.code(403);
          return { error: 'Accès refusé' };
        }

        if (size > 25 * 1024 * 1024) {
          reply.code(413);
          return { error: 'Fichier trop volumineux (>25MB)' };
        }

        const { tempDir } = getUploadDirs();
        const uploadId = randomUUID();
        const manifest = {
          uploadId,
          conversationId,
          uploaderId: userId,
          filename,
          mime,
          size,
          total: 0,
          received: [] as number[],
          createdAt: Date.now(),
        };

        writeFileSync(join(tempDir, `${uploadId}.json`), JSON.stringify(manifest));
        return { uploadId };
      }
    );

    // Upload chunk
    fastify.post(
      `${prefix}/chunk`,
      { preHandler: fastify.authenticate as any, config: { rateLimit: fastify.uploadLimiter as any } },
      async (request, reply) => {
        const db = getDatabase();
        const parts = request.parts();
        let uploadId: string | undefined;
        let index = -1;
        let total = -1;
        let chunkBuf: Buffer | null = null;

        for await (const part of parts) {
          if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const ch of part.file) {
              chunks.push(ch as Buffer);
            }
            chunkBuf = Buffer.concat(chunks);
          } else if (part.type === 'field') {
            if (part.fieldname === 'uploadId') {
              uploadId = part.value as string;
            }
            if (part.fieldname === 'index') {
              index = Number(part.value);
            }
            if (part.fieldname === 'total') {
              total = Number(part.value);
            }
          }
        }

        if (!uploadId || chunkBuf === null || index < 0 || total <= 0) {
          reply.code(400);
          return { error: 'uploadId, index, total et chunk requis' };
        }

        const { tempDir } = getUploadDirs();
        const manifestPath = join(tempDir, `${uploadId}.json`);

        if (!existsSync(manifestPath)) {
          reply.code(404);
          return { error: 'Upload inconnu' };
        }

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as any;

        // Auth: ensure caller is uploader or member
        const members = await db.getConversationMembers(manifest.conversationId);
        const userId = (request.user as any).sub as string;
        if (!members.includes(userId)) {
          reply.code(403);
          return { error: 'Accès refusé' };
        }

        const partPath = join(tempDir, `${uploadId}.${index}.part`);
        writeFileSync(partPath, chunkBuf);
        manifest.total = total;
        if (!manifest.received.includes(index)) {
          manifest.received.push(index);
        }
        writeFileSync(manifestPath, JSON.stringify(manifest));
        return { received: manifest.received };
      }
    );

    // Get upload status
    fastify.get(
      `${prefix}/status/:id`,
      { preHandler: fastify.authenticate as any, config: { rateLimit: fastify.uploadLimiter as any } },
      async (request, reply) => {
        const db = getDatabase();
        const { tempDir } = getUploadDirs();
        const uploadId = (request.params as { id: string }).id;
        const manifestPath = join(tempDir, `${uploadId}.json`);

        if (!existsSync(manifestPath)) {
          reply.code(404);
          return { error: 'Upload inconnu' };
        }

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as any;
        const members = await db.getConversationMembers(manifest.conversationId);
        const userId = (request.user as any).sub as string;

        if (!members.includes(userId)) {
          reply.code(403);
          return { error: 'Accès refusé' };
        }

        return { received: manifest.received, total: manifest.total };
      }
    );

    // Commit chunked upload
    fastify.post(
      `${prefix}/commit`,
      { preHandler: fastify.authenticate as any, config: { rateLimit: fastify.uploadLimiter as any } },
      async (request, reply) => {
        const db = getDatabase();
        const { uploadId } = request.body as any;

        if (!uploadId) {
          reply.code(400);
          return { error: 'uploadId requis' };
        }

        const { uploadDir, tempDir } = getUploadDirs();
        const manifestPath = join(tempDir, `${uploadId}.json`);

        if (!existsSync(manifestPath)) {
          reply.code(404);
          return { error: 'Upload inconnu' };
        }

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as any;
        const members = await db.getConversationMembers(manifest.conversationId);
        const userId = (request.user as any).sub as string;

        if (!members.includes(userId)) {
          reply.code(403);
          return { error: 'Accès refusé' };
        }

        if (manifest.total <= 0) {
          reply.code(400);
          return { error: 'total invalide' };
        }

        // Check all chunks are present
        for (let i = 0; i < manifest.total; i++) {
          if (!existsSync(join(tempDir, `${uploadId}.${i}.part`))) {
            reply.code(400);
            return { error: `chunk manquant: ${i}` };
          }
        }

        // Merge chunks into final file
        const finalId = randomUUID();
        const finalPath = join(uploadDir, `${finalId}.bin`);
        const ws = createWriteStream(finalPath);

        for (let i = 0; i < manifest.total; i++) {
          const part = readFileSync(join(tempDir, `${uploadId}.${i}.part`));
          ws.write(part);
        }

        await new Promise<void>((res, rej) => {
          ws.end(() => res());
          ws.on('error', rej);
        });

        // Cleanup chunk files and manifest to prevent disk leaks
        try {
          for (let i = 0; i < manifest.total; i++) {
            try {
              unlinkSync(join(tempDir, `${uploadId}.${i}.part`));
            } catch {}
          }
          try {
            unlinkSync(manifestPath);
          } catch {}
        } catch {}

        // Decrement active upload counter
        try {
          const prev = activeUploadsByUser.get(manifest.uploaderId) || 1;
          activeUploadsByUser.set(manifest.uploaderId, Math.max(0, prev - 1));
        } catch {}

        const rec = await db.createAttachment({
          id: finalId,
          conversation_id: manifest.conversationId,
          uploader_id: manifest.uploaderId,
          filename: manifest.filename,
          mime: manifest.mime,
          size: manifest.size,
          path: finalPath,
        });

        return { id: rec.id, filename: rec.filename, mime: rec.mime, size: rec.size };
      }
    );

  // ============================================================================
  // SINGLE-SHOT UPLOAD ENDPOINT
  // ============================================================================

    // Upload attachment (single request)
    fastify.post(
      prefix,
      { preHandler: fastify.authenticate as any, config: { rateLimit: fastify.uploadLimiter as any } },
      async (request, reply) => {
        const db = getDatabase();
        const userId = (request.user as any).sub as string;
        const parts = request.parts();
        let conversationId: string | undefined;
        const meta: { filename?: string; mime?: string } = {};
        let fileBuffer: Buffer | null = null;

        for await (const part of parts) {
          if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk as Buffer);
            }
            fileBuffer = Buffer.concat(chunks);
            if (!meta.filename) {
              meta.filename = part.filename || 'file.bin';
            }
            if (!meta.mime) {
              meta.mime = part.mimetype || 'application/octet-stream';
            }
          } else if (part.type === 'field') {
            if (part.fieldname === 'conversationId') {
              conversationId = part.value as string;
            }
            if (part.fieldname === 'filename') {
              meta.filename = part.value as string;
            }
            if (part.fieldname === 'mime') {
              meta.mime = part.value as string;
            }
          }
        }

        if (!conversationId || !fileBuffer) {
          reply.code(400);
          return { error: 'conversationId et file requis' };
        }

        const convo = await db.getConversationById(conversationId);
        if (!convo) {
          reply.code(404);
          return { error: 'Conversation introuvable' };
        }

        const members = await db.getConversationMembers(conversationId);
        if (!members.includes(userId)) {
          reply.code(403);
          return { error: 'Accès refusé' };
        }

        const dataDir = process.env.BRIDGE_DATA_DIR || './data';
        const uploadDir = join(dataDir, 'uploads');
        try {
          mkdirSync(uploadDir, { recursive: true });
        } catch {}

        const id = randomUUID();
        const safeName = id + '.bin';
        const path = join(uploadDir, safeName);

        await new Promise<void>((resolve, reject) => {
          const ws = createWriteStream(path);
          ws.on('error', reject);
          ws.on('finish', () => resolve());
          ws.end(fileBuffer);
        });

        const rec = await db.createAttachment({
          id,
          conversation_id: conversationId,
          uploader_id: userId,
          filename: meta.filename || 'file.bin',
          mime: meta.mime || 'application/octet-stream',
          size: fileBuffer.length,
          path,
        });

        return { id: rec.id, filename: rec.filename, mime: rec.mime, size: rec.size };
      }
    );

  // ============================================================================
  // DOWNLOAD ENDPOINT
  // ============================================================================

    // Download attachment
    fastify.get(`${prefix}/:id`, { preHandler: fastify.authenticate as any }, async (request, reply) => {
      const db = getDatabase();
      const userId = (request.user as any).sub as string;
      const id = (request.params as { id: string }).id;
      const att = await db.getAttachmentById(id);

      if (!att) {
        reply.code(404);
        return { error: 'Fichier introuvable' };
      }

      const members = await db.getConversationMembers(att.conversation_id);
      if (!members.includes(userId)) {
        reply.code(403);
        return { error: 'Accès refusé' };
      }

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${att.filename.replace(/"/g, '')}.enc"`);
      return reply.send(await import('fs').then((fs) => fs.readFileSync(att.path)));
    });
  }

  for (const prefix of ROUTE_PREFIXES) {
    registerRoutes(prefix);
  }
}
