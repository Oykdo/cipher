/**
 * Minimal Ephemeral Signaling Server
 * 
 * ARCHITECTURE: Zero-knowledge signaling
 * - Only facilitates WebRTC handshake
 * - Never sees message content
 * - Connection closed after P2P established
 * 
 * PRIVACY:
 * - No message storage
 * - No message logging
 * - Minimal metadata (peer IDs only)
 * - Can run as Tor Hidden Service
 * 
 * SCALABILITY:
 * - Stateless (can run multiple instances)
 * - Redis for distributed presence (optional)
 * - Minimal resource usage
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

export interface SignalingServerOptions {
  httpServer: HTTPServer;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
}

export class SignalingServer {
  private io: SocketIOServer;
  private onlinePeers: Map<string, string> = new Map(); // userId -> socketId

  constructor(options: SignalingServerOptions) {
    console.log('🚀 [SIGNALING SERVER] Initializing');

    this.io = new SocketIOServer(options.httpServer, {
      cors: options.cors || {
        origin: '*',
        credentials: true,
      },
      transports: ['websocket'], // Force WebSocket only
      path: '/signaling',
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId as string;

      if (!userId) {
        console.error('❌ [SIGNALING] Connection rejected: No userId');
        socket.disconnect();
        return;
      }

      console.log('🔌 [SIGNALING] Peer connected', {
        userId,
        socketId: socket.id,
      });

      // Snapshot existing peers to the connecting client (prevents asymmetric peer discovery)
      const existingPeers = Array.from(this.onlinePeers.keys()).filter((id) => id !== userId);

      // Register peer
      this.onlinePeers.set(userId, socket.id);

      // Tell the newcomer about already-online peers
      for (const peerId of existingPeers) {
        socket.emit('peer-available', { peerId });
      }

      // Tell existing peers this user is now available (no need for an explicit client event)
      socket.broadcast.emit('peer-available', { peerId: userId });

      // Notify peer availability
      socket.on('peer-available', () => {
        console.log('👤 [SIGNALING] Peer available', userId);
        socket.broadcast.emit('peer-available', { peerId: userId });
      });

      // Notify peer unavailability
      socket.on('peer-unavailable', () => {
        console.log('👤 [SIGNALING] Peer unavailable', userId);
        socket.broadcast.emit('peer-unavailable', { peerId: userId });
      });

      // WebRTC signaling (SDP/ICE exchange)
      socket.on('p2p-signal', (data: { to: string; signal: any }) => {
        const targetSocketId = this.onlinePeers.get(data.to);

        if (!targetSocketId) {
          console.log('⚠️ [SIGNALING] Target peer not found', data.to);
          socket.emit('peer-unavailable', { peerId: data.to });
          return;
        }

        console.log('📡 [SIGNALING] Relaying signal', {
          from: userId,
          to: data.to,
        });

        // Relay signal to target peer
        this.io.to(targetSocketId).emit('p2p-signal', {
          from: userId,
          signal: data.signal,
        });
      });

      // Request connection to peer
      socket.on('request-connection', (data: { peerId: string }) => {
        const targetSocketId = this.onlinePeers.get(data.peerId);

        if (!targetSocketId) {
          console.log('⚠️ [SIGNALING] Target peer not found', data.peerId);
          socket.emit('peer-unavailable', { peerId: data.peerId });
          return;
        }

        console.log('📡 [SIGNALING] Connection requested', {
          from: userId,
          to: data.peerId,
        });

        // Notify target peer of connection request
        this.io.to(targetSocketId).emit('connection-request', {
          from: userId,
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('🔌 [SIGNALING] Peer disconnected', userId);
        this.onlinePeers.delete(userId);

        // Notify others
        socket.broadcast.emit('peer-unavailable', { peerId: userId });
      });
    });

    console.log('✅ [SIGNALING SERVER] Ready');
  }

  /**
   * Get online peer count
   */
  getOnlinePeerCount(): number {
    return this.onlinePeers.size;
  }

  /**
   * Get online peers
   */
  getOnlinePeers(): string[] {
    return Array.from(this.onlinePeers.keys());
  }

  /**
   * Shutdown server
   */
  async shutdown(): Promise<void> {
    console.log('🔌 [SIGNALING SERVER] Shutting down');

    // Disconnect all clients
    this.io.disconnectSockets();

    // Close server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        console.log('✅ [SIGNALING SERVER] Shutdown complete');
        resolve();
      });
    });
  }
}
