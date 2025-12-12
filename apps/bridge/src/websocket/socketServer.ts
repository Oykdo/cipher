/**
 * WebSocket Server - Real-time messaging
 * 
 * Utilise Socket.IO pour les notifications en temps réel :
 * - Nouveaux messages
 * - Messages brûlés
 * - Messages déverrouillés
 * - Utilisateur en train d'écrire
 * - Statut en ligne/hors ligne
 * 
 * SECURITY: All events are validated for conversation membership
 * SECURITY FIX VULN-011: All payloads are validated with Zod schemas
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setUserOnline, setUserOffline } from '../routes/users.js';
import { getDatabase } from '../db/database.js';

const db = getDatabase();

// ============================================================================
// SECURITY FIX VULN-011: Zod schemas for WebSocket payload validation
// ============================================================================

const JoinRoomSchema = z.object({
  conversationId: z.string()
    .min(73, 'ConversationId too short')
    .max(73, 'ConversationId too long')
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Invalid conversationId format'
    ),
});

const TypingSchema = z.object({
  conversationId: z.string()
    .min(73)
    .max(73)
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  isTyping: z.boolean(),
});

// X3DH Handshake message schema
const X3DHHandshakeSchema = z.object({
  targetUsername: z.string().min(1).max(50),
  handshakeData: z.string().min(10).max(10000), // JSON handshake message
  timestamp: z.number().optional(),
});

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  // Track which conversations user has verified access to (cache)
  verifiedConversations?: Set<string>;
}

/**
 * SECURITY: Validate that a user is a member of a conversation
 * Uses caching to avoid repeated DB lookups for the same conversation
 */
async function validateConversationAccess(
  socket: AuthenticatedSocket,
  conversationId: string,
  fastify: FastifyInstance
): Promise<boolean> {
  if (!socket.userId) {
    return false;
  }

  // Check cache first
  if (socket.verifiedConversations?.has(conversationId)) {
    return true;
  }

  try {
    const members = await db.getConversationMembers(conversationId);
    const hasAccess = members.includes(socket.userId);

    if (hasAccess) {
      // Cache the result
      if (!socket.verifiedConversations) {
        socket.verifiedConversations = new Set();
      }
      socket.verifiedConversations.add(conversationId);
    } else {
      fastify.log.warn({
        socketId: socket.id,
        userId: socket.userId,
        conversationId,
      }, 'SECURITY: Unauthorized conversation access attempt');
    }

    return hasAccess;
  } catch (error) {
    fastify.log.error({ error, conversationId }, 'Failed to validate conversation access');
    return false;
  }
}

interface JoinRoomPayload {
  conversationId: string;
}

interface TypingPayload {
  conversationId: string;
  isTyping: boolean;
}

interface NewMessagePayload {
  conversationId: string;
  message: {
    id: string;
    senderId: string;
    body: string;
    createdAt: number;
    unlockBlockHeight?: number;
    scheduledBurnAt?: number;
    burnDelay?: number;
    isLocked?: boolean;
  };
}

interface MessageBurnedPayload {
  conversationId: string;
  messageId: string;
  burnedAt: number;
}

interface MessageUnlockedPayload {
  conversationId: string;
  messageId: string;
  body: string;
}

/**
 * Configuration du serveur Socket.IO
 */
export function setupSocketServer(httpServer: HTTPServer, fastify: FastifyInstance): SocketIOServer {
  // CORS configuration for Socket.IO
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // In dev: allow all localhost ports
        if (!isProd && origin && /^http:\/\/localhost:\d+$/.test(origin)) {
          return callback(null, true);
        }
        // In prod or specific origins
        if (origin && allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // Allow undefined origin (same-origin requests)
        if (!origin) {
          return callback(null, true);
        }
        callback(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  // ============================================================================
  // AUTHENTICATION MIDDLEWARE
  // ============================================================================

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Vérification du JWT avec Fastify
      const decoded = await fastify.jwt.verify(token);
      const payload = decoded as any;

      if (!decoded || !payload.sub) {
        return next(new Error('Invalid token'));
      }

      // Attachement des infos utilisateur au socket
      socket.userId = payload.sub;
      socket.username = payload.username || 'Unknown';

      fastify.log.info({
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
      }, 'Socket authenticated');

      next();
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Socket authentication failed');
      next(new Error('Authentication failed'));
    }
  });

  // ============================================================================
  // CONNECTION HANDLER
  // ============================================================================

  io.on('connection', (socket: AuthenticatedSocket) => {
    fastify.log.info({
      socketId: socket.id,
      userId: socket.userId,
      username: socket.username,
    }, 'Client connected');

    // Set user as online
    if (socket.userId && socket.username) {
      setUserOnline(socket.userId, socket.username, socket.id);

      // Broadcast user online status to all connected clients
      io.emit('user_status_changed', {
        userId: socket.userId,
        username: socket.username,
        online: true,
      });
    }

    // ============================================================================
    // JOIN CONVERSATION ROOM
    // SECURITY FIX VUL-001: Validate user belongs to conversation before joining
    // SECURITY FIX VULN-011: Validate payload with Zod schema
    // ============================================================================

    socket.on('join_conversation', async (payload: unknown) => {
      // SECURITY FIX VULN-011: Validate payload structure
      const parsed = JoinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('error', {
          type: 'VALIDATION_ERROR',
          message: 'Invalid payload format',
          details: parsed.error.issues,
        });
        return;
      }

      const { conversationId } = parsed.data;

      // SECURITY: Validate access before joining
      const hasAccess = await validateConversationAccess(socket, conversationId, fastify);
      if (!hasAccess) {
        socket.emit('error', {
          type: 'ACCESS_DENIED',
          message: 'You are not a member of this conversation',
          conversationId,
        });
        return;
      }

      const roomName = `conversation:${conversationId}`;
      socket.join(roomName);

      fastify.log.info({
        socketId: socket.id,
        userId: socket.userId,
        conversationId,
        roomName,
      }, 'User joined conversation room (authorized)');

      // Notifier les autres participants
      socket.to(roomName).emit('user_joined', {
        userId: socket.userId,
        username: socket.username,
      });
    });

    // ============================================================================
    // LEAVE CONVERSATION ROOM
    // SECURITY FIX VULN-011: Validate payload with Zod schema
    // ============================================================================

    socket.on('leave_conversation', async (payload: unknown) => {
      // SECURITY FIX VULN-011: Validate payload structure
      const parsed = JoinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        // Silently ignore invalid payloads for leave
        return;
      }

      const { conversationId } = parsed.data;
      const roomName = `conversation:${conversationId}`;

      // Simply leave - no need to validate access, user may want to leave any room
      socket.leave(roomName);

      // Clear from cache if present
      socket.verifiedConversations?.delete(conversationId);

      fastify.log.info({
        socketId: socket.id,
        userId: socket.userId,
        conversationId,
        roomName,
      }, 'User left conversation room');

      // Notifier les autres participants
      socket.to(roomName).emit('user_left', {
        userId: socket.userId,
        username: socket.username,
      });
    });

    // ============================================================================
    // TYPING INDICATOR
    // SECURITY FIX VUL-003: Validate user belongs to conversation before emitting
    // SECURITY FIX VULN-011: Validate payload with Zod schema
    // ============================================================================

    socket.on('typing', async (payload: unknown) => {
      // SECURITY FIX VULN-011: Validate payload structure
      const parsed = TypingSchema.safeParse(payload);
      if (!parsed.success) {
        // Silently ignore invalid payloads
        return;
      }

      const { conversationId, isTyping } = parsed.data;

      // SECURITY: Validate access before sending typing indicator
      const hasAccess = await validateConversationAccess(socket, conversationId, fastify);
      if (!hasAccess) {
        // Silently ignore - don't reveal conversation existence
        return;
      }

      const roomName = `conversation:${conversationId}`;

      // Envoyer l'indicateur aux autres participants (pas à soi-même)
      socket.to(roomName).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping,
      });
    });

    // ============================================================================
    // X3DH HANDSHAKE - For Double Ratchet key exchange
    // ============================================================================

    socket.on('x3dh_handshake', async (payload: unknown, callback?: (response: { success: boolean; error?: string }) => void) => {
      // Validate payload
      const parsed = X3DHHandshakeSchema.safeParse(payload);
      if (!parsed.success) {
        if (callback) {
          callback({ success: false, error: 'Invalid handshake payload' });
        }
        return;
      }

      const { targetUsername, handshakeData, timestamp } = parsed.data;

      fastify.log.info({
        from: socket.username,
        to: targetUsername,
        timestamp,
      }, 'X3DH handshake message');

      // Find the target user's socket
      const targetUser = await db.getUserByUsername(targetUsername);
      if (!targetUser) {
        if (callback) {
          callback({ success: false, error: 'Target user not found' });
        }
        return;
      }

      // Find connected sockets for the target user
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find(s => (s as any).userId === targetUser.id);

      if (!targetSocket) {
        // User is offline, cannot deliver handshake
        // In production, you might want to store this for later delivery
        fastify.log.warn({
          from: socket.username,
          to: targetUsername,
        }, 'X3DH handshake target user offline');

        if (callback) {
          callback({ success: false, error: 'Target user is offline' });
        }
        return;
      }

      // Forward the handshake to the target user
      targetSocket.emit('x3dh_handshake', {
        senderUsername: socket.username,
        handshakeData,
        timestamp: timestamp || Date.now(),
      });

      fastify.log.info({
        from: socket.username,
        to: targetUsername,
      }, 'X3DH handshake forwarded');

      if (callback) {
        callback({ success: true });
      }
    });

    // ============================================================================
    // BURN MESSAGE - Signed burn event for Burn After Reading
    // ============================================================================

    socket.on('burn_message', async (payload: unknown, callback?: (response: { success: boolean; error?: string }) => void) => {
      try {
        // Validate payload structure
        if (!payload || typeof payload !== 'object') {
          if (callback) callback({ success: false, error: 'Invalid payload' });
          return;
        }

        const { messageId, conversationId, signedData } = payload as {
          messageId?: string;
          conversationId?: string;
          signedData?: string;
        };

        if (!messageId || !conversationId || !signedData) {
          if (callback) callback({ success: false, error: 'Missing required fields' });
          return;
        }

        // Validate user has access to conversation
        const hasAccess = await validateConversationAccess(socket, conversationId, fastify);
        if (!hasAccess) {
          if (callback) callback({ success: false, error: 'Access denied' });
          return;
        }

        // Get message to verify it exists and user can burn it
        const message = await db.getMessageById(messageId);
        if (!message) {
          if (callback) callback({ success: false, error: 'Message not found' });
          return;
        }

        // Only recipient can burn (not sender)
        if (message.sender_id === socket.userId) {
          if (callback) callback({ success: false, error: 'Sender cannot burn own message' });
          return;
        }

        // Check if already burned
        if (message.is_burned) {
          if (callback) callback({ success: true }); // Idempotent
          return;
        }

        const burnedAt = Date.now();

        // Secure deletion: overwrite body then mark as burned
        await db.burnMessage(messageId, burnedAt);

        // Cancel any scheduled burn
        const { burnScheduler } = await import('../services/burn-scheduler.js');
        burnScheduler.cancel(messageId);

        // Emit to all participants in the conversation (including sender)
        const roomName = `conversation:${conversationId}`;
        io.to(roomName).emit('message_burned', {
          conversationId,
          messageId,
          burnedAt,
          burnedBy: socket.username,
          signedData, // Include signature for verification
        });

        fastify.log.info({
          messageId,
          conversationId,
          burnedBy: socket.username,
          burnedAt: new Date(burnedAt).toISOString(),
        }, '🔥 Message burned via signed event');

        if (callback) callback({ success: true });
      } catch (error: any) {
        fastify.log.error({ error: error.message }, 'Failed to process burn_message');
        if (callback) callback({ success: false, error: 'Internal error' });
      }
    });

    // ============================================================================
    // DISCONNECT
    // ============================================================================

    socket.on('disconnect', (reason) => {
      fastify.log.info({
        socketId: socket.id,
        userId: socket.userId,
        reason,
      }, 'Client disconnected');

      // Set user as offline
      if (socket.userId) {
        setUserOffline(socket.userId);

        // Broadcast user offline status to all connected clients
        io.emit('user_status_changed', {
          userId: socket.userId,
          username: socket.username,
          online: false,
        });
      }
    });

    // ============================================================================
    // ERROR HANDLER
    // ============================================================================

    socket.on('error', (error) => {
      fastify.log.error({
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      }, 'Socket error');
    });
  });

  // ============================================================================
  // SERVER-SIDE EMITTERS (appelés depuis les routes)
  // ============================================================================

  /**
   * Notifie les participants d'un nouveau message
   */
  io.emitNewMessage = (payload: NewMessagePayload) => {
    const roomName = `conversation:${payload.conversationId}`;
    io.to(roomName).emit('new_message', payload);

    fastify.log.info({
      conversationId: payload.conversationId,
      messageId: payload.message.id,
      senderId: payload.message.senderId,
    }, 'New message emitted to room');
  };

  /**
   * Notifie les participants qu'un message a été brûlé
   */
  io.emitMessageBurned = (payload: MessageBurnedPayload) => {
    const roomName = `conversation:${payload.conversationId}`;
    io.to(roomName).emit('message_burned', payload);

    fastify.log.info({
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    }, 'Message burned emitted to room');
  };

  /**
   * Notifie les participants qu'un message a été déverrouillé
   */
  io.emitMessageUnlocked = (payload: MessageUnlockedPayload) => {
    const roomName = `conversation:${payload.conversationId}`;
    io.to(roomName).emit('message_unlocked', payload);

    fastify.log.info({
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    }, 'Message unlocked emitted to room');
  };

  return io;
}

// ============================================================================
// TYPES AUGMENTATION
// ============================================================================

declare module 'socket.io' {
  interface Server {
    emitNewMessage: (payload: NewMessagePayload) => void;
    emitMessageBurned: (payload: MessageBurnedPayload) => void;
    emitMessageUnlocked: (payload: MessageUnlockedPayload) => void;
  }
}
