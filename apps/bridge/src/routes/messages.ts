import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/database.js';
import { ConversationIdSchema } from '../validation/securitySchemas.js';

const db = getDatabase();

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  // sender_plaintext field removed in privacy-l1.
  createdAt: number;
  unlockBlockHeight?: number;
  isLocked?: boolean;
}

export async function messageRoutes(fastify: FastifyInstance) {
  // Get conversation messages (paginated)
  fastify.get(
    '/api/v2/conversations/:id/messages',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const id = (request.params as { id: string }).id;
      const { before, limit } = (request.query as any) || {};

      const convo = await db.getConversationById(id);
      if (!convo) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const members = await db.getConversationMembers(id);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const cursor = Number(before) || Date.now() + 1;

      fastify.log.info({
        conversationId: id,
        cursor,
        pageLimit,
      }, '[MESSAGES] Fetching messages from DB');

      const pageDesc = await db.getConversationMessagesPaged(id, cursor, pageLimit);
      const dbMessages = pageDesc.reverse();

      fastify.log.info({
        conversationId: id,
        messagesFromDb: dbMessages.length,
        firstMessageId: dbMessages[0]?.id,
      }, '[MESSAGES] Messages fetched from DB');

      // Privacy-l1: this fetch counts as delivery for the recipient.
      // Marking happens once the response is built so we never deny the
      // user their messages on a tracking failure.
      // Fire-and-forget — purge worker tolerates eventual delivery.
      void db.markMessagesDeliveredFor(id, userId).catch((err) =>
        fastify.log.warn({ err, conversationId: id, userId }, '[MESSAGES] markMessagesDeliveredFor failed')
      );

      // Server-side time-lock validation and filtering
      const messages = await Promise.all(
        dbMessages
          .filter(msg => {
            // Filter out burned messages (PostgreSQL boolean or SQLite integer)
            const isBurned = msg.is_burned === true || msg.is_burned === 1;
            return !isBurned;
          })
          .map(async (msg) => {
            const unlockHeight = msg.unlock_block_height;

            // ✅ FIX: Ne vérifier isLocked QUE si unlockHeight est défini ET supérieur à 0
            // Time-lock is now enforced client-side via tlock/drand (the body
            // is cryptographically unreadable until the drand round arrives).
            // The server no longer gates the body — it just passes
            // `unlockBlockHeight` (now a drand round number) through, and the
            // client handles the countdown + decryption.
            const isLocked = false;

            // sender_plaintext column dropped in privacy-l1. The sender now
            // stores a self-addressed ciphertext locally — see
            // apps/frontend/src/lib/e2ee/selfEncryptingMessage.ts.

            // ✅ IMPORTANT: Toujours retourner msg.body (chiffré) sauf si vraiment verrouillé
            // Ne pas retourner '[Message verrouillé]' si isLocked est false
            // Handle scheduled burn time
            let scheduledBurnAt: number | undefined;
            let burnDelay: number | undefined;
            
            if (msg.scheduled_burn_at) {
              const burnValue = typeof msg.scheduled_burn_at === 'object'
                ? new Date(msg.scheduled_burn_at).getTime()
                : msg.scheduled_burn_at;
              
              if (burnValue < 0) {
                // Negative value = delay in seconds (not yet acknowledged)
                burnDelay = Math.abs(burnValue);
                scheduledBurnAt = undefined; // Will be set on acknowledge
              } else {
                // Positive value = absolute timestamp
                scheduledBurnAt = burnValue;
                burnDelay = undefined;
              }
            }

            return {
              id: msg.id,
              conversationId: msg.conversation_id,
              senderId: msg.sender_id,
              body: msg.body,
              createdAt: msg.created_at,
              unlockBlockHeight: unlockHeight || undefined,
              isLocked,
              // Burn After Reading fields
              isBurned: msg.is_burned || false,
              burnedAt: msg.burned_at ? new Date(msg.burned_at).getTime() : undefined,
              scheduledBurnAt,
              burnDelay, // Added: delay in seconds for BAR messages
            };
          })
      );

      // SECURITY FIX VUL-005: Don't log message content
      fastify.log.info({
        conversationId: id,
        messagesReturned: messages.length,
        hasLockedMessages: messages.some(m => m.isLocked),
      }, '[MESSAGES] Returning messages to client');

      // ✅ FIX: Return object with messages property (not array directly)
      // Frontend expects: { messages: [...], hasMore: boolean }
      return {
        messages,
        hasMore: messages.length >= pageLimit,
      };
    }
  );

  // Send message
  fastify.post(
    '/api/v2/messages',
    {
      preHandler: fastify.authenticate as any,
      config: { rateLimit: fastify.messageLimiter as any },
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      const {
        conversationId,
        body,
        unlockBlockHeight,
        scheduledBurnAt,
        burnDelay,
      } = request.body as {
        conversationId?: string;
        body?: string;
        unlockBlockHeight?: number;
        scheduledBurnAt?: number;
        burnDelay?: number; // Burn delay in seconds (for Burn-After-Reading)
      };

      if (!conversationId || !body) {
        reply.code(400);
        return { error: 'conversationId et body requis' };
      }

      // Validate message size (max 100KB)
      if (body.length > 100000) {
        reply.code(413);
        return { error: 'Message trop long (max 100KB)' };
      }

      // Defense in depth: reject senderPlaintext if a legacy client still
      // sends it. After privacy-l1 the sender keeps a local self-addressed
      // ciphertext via selfEncryptingMessage.ts — never a plaintext copy
      // on the server.
      if ((request.body as unknown as Record<string, unknown>).senderPlaintext !== undefined) {
        reply.code(400);
        return {
          error: 'senderPlaintext non accepté : utilisez selfEncryptingMessage côté client.',
        };
      }

      // SECURITY FIX VUL-004: Use strict Zod schema for validation
      const validationResult = ConversationIdSchema.safeParse(conversationId);
      if (!validationResult.success) {
        reply.code(400);
        return { error: 'Format conversationId invalide', details: validationResult.error.issues };
      }

      // Time-lock: the field historically carried a Bitcoin block height
      // but now holds a drand round number (tlock migration shipped in
      // v1.2.4). The server passes it through opaquely — the actual lock
      // is BLS12-381 identity-based encryption towards a future drand
      // round, enforced cryptographically by the client (see
      // apps/frontend/src/lib/tlock.ts). Server-side validation is just
      // shape-checking.
      if (unlockBlockHeight !== undefined) {
        if (
          typeof unlockBlockHeight !== 'number' ||
          !Number.isInteger(unlockBlockHeight) ||
          unlockBlockHeight <= 0
        ) {
          reply.code(400);
          return { error: 'unlockBlockHeight must be a positive integer (drand round)' };
        }
      }

      // Validate burn delay (for Burn-After-Reading)
      // Max aligned with the frontend BurnDelaySelector (7 days = 604800 s) and
      // with the scheduledBurnAt cap below, so the UI presets (1h / 24h / 7j)
      // all reach the server without a 400.
      if (burnDelay !== undefined) {
        const MAX_BURN_DELAY_SECONDS = 7 * 24 * 60 * 60; // 604800
        if (
          typeof burnDelay !== 'number' ||
          !Number.isFinite(burnDelay) ||
          burnDelay < 1 ||
          burnDelay > MAX_BURN_DELAY_SECONDS
        ) {
          reply.code(400);
          return {
            error: `burnDelay doit être entre 1 et ${MAX_BURN_DELAY_SECONDS} secondes (7 jours)`,
          };
        }
      }

      // Validate scheduled burn (deprecated - use burnDelay instead)
      if (scheduledBurnAt !== undefined) {
        if (typeof scheduledBurnAt !== 'number' || scheduledBurnAt < Date.now()) {
          reply.code(400);
          return { error: 'scheduledBurnAt doit être un timestamp futur' };
        }

        // Max 7 days in the future
        const maxBurnDelay = 7 * 24 * 60 * 60 * 1000;
        if (scheduledBurnAt > Date.now() + maxBurnDelay) {
          reply.code(400);
          return { error: 'scheduledBurnAt ne peut pas dépasser 7 jours' };
        }
      }

      const convo = await db.getConversationById(conversationId);
      if (!convo) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      const members = await db.getConversationMembers(conversationId);
      if (!members.includes(userId)) {
        reply.code(404);
        return { error: 'Conversation introuvable' };
      }

      // Defense in depth (1.2.0): groups must use e2ee-v2 only. e2ee-v1
      // chains keys per (sender, peer) pair and cannot represent N
      // recipients — accepting one in a group would silently leave most
      // members unable to decrypt. The body is otherwise opaque, so we
      // best-effort detect the v1 shape via JSON.parse and reject.
      if (convo.type === 'group') {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.version === 'e2ee-v1') {
            reply.code(400);
            return {
              error: 'e2ee-v1 envelopes are not allowed in group conversations. Use e2ee-v2.',
            };
          }
        } catch {
          // Body isn't JSON (or is malformed) — let it through; client-
          // side encryption is opaque to us anyway.
        }
      }

      const messageId = randomUUID();

      // Calculate scheduled burn time
      // If burnDelay is provided (new Burn-After-Reading), store it as negative value
      // The actual burn time will be calculated when the recipient acknowledges
      let finalScheduledBurnAt = scheduledBurnAt;
      if (burnDelay !== undefined) {
        // Store as negative to indicate "delay after reading" instead of absolute time
        // This is a hack until we add a proper burn_delay column
        finalScheduledBurnAt = -burnDelay; // Negative = seconds after reading
      }

      const dbMessage = await db.createMessage({
        id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        body,
        unlock_block_height: unlockBlockHeight,
        scheduled_burn_at: finalScheduledBurnAt,
      });

      // Schedule burn if needed (only for absolute timestamps, not delays)
      if (scheduledBurnAt && scheduledBurnAt > 0) {
        const { burnScheduler } = await import('../services/burn-scheduler.js');
        burnScheduler.schedule(messageId, conversationId, scheduledBurnAt);
      }

      // Time-lock is now enforced client-side via tlock/drand (see GET
      // /messages handler above). The server no longer substitutes the body
      // with a placeholder — it passes the tlock ciphertext through and the
      // client decrypts it when the drand round is published. `isLocked` is
      // kept in the payload for backward compatibility with the frontend
      // shape but always false.
      const isLocked = false;

      const message = {
        id: dbMessage.id,
        conversationId: dbMessage.conversation_id,
        senderId: dbMessage.sender_id,
        body: dbMessage.body,
        createdAt: typeof dbMessage.created_at === 'object'
          ? new Date(dbMessage.created_at).getTime()
          : dbMessage.created_at,
        unlockBlockHeight: unlockBlockHeight,
        isLocked,
        // Burn After Reading fields
        isBurned: false,
        scheduledBurnAt: scheduledBurnAt,
        burnDelay: burnDelay,
      };

      // The sender's ability to re-read their own messages on a fresh
      // device is now provided by selfEncryptingMessage.ts (a parallel
      // ciphertext addressed to themselves). The HTTP response contains
      // only the public envelope — no plaintext leakage.
      const payload = {
        type: 'message' as const,
        conversationId,
        message,
      };

      // Legacy WebSocket broadcast
      fastify.broadcast(members, payload);

      // Socket.IO emit for real-time updates
      const realtimePayload = {
        conversationId,
        message: {
          id: message.id,
          senderId: message.senderId,
          body: dbMessage.body,
          createdAt: message.createdAt,
          unlockBlockHeight: message.unlockBlockHeight,
          scheduledBurnAt: scheduledBurnAt,
          burnDelay: burnDelay,
          isLocked: isLocked,
        },
      };

      // Emit to conversation room (when client joined)
      fastify.io.emitNewMessage(realtimePayload);

      // Also emit to each participant's private room so messages are received even
      // when they are not currently joined to the conversation room.
      for (const memberId of members) {
        fastify.io.to(`user:${memberId}`).emit('new_message', realtimePayload);
      }

      // Privacy-l1: response carries the public envelope only — no
      // separate sender_plaintext (the sender's self-readable copy is
      // baked into the ciphertext via senderCopy / e2ee-v2 keys map).
      return message;
    }
  );
}
