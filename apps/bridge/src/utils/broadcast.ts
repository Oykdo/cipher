/**
 * Broadcast Utility
 * Sends real-time messages to users via Socket.IO
 */

import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

/**
 * Initialize broadcast with Socket.IO instance
 */
export function initBroadcast(socketServer: SocketIOServer): void {
  io = socketServer;
}

/**
 * Broadcast a message to specific users
 * @param userIds Array of user IDs to send to
 * @param payload Message payload
 */
export function broadcast(userIds: string[], payload: any): void {
  if (!io) {
    console.warn('[Broadcast] Socket.IO not initialized, skipping broadcast');
    return;
  }

  for (const userId of userIds) {
    // Send to all sockets connected for this user
    io.to(`user:${userId}`).emit('message', payload);
  }
}

/**
 * Broadcast to a conversation room
 * @param conversationId Conversation ID
 * @param payload Message payload
 */
export function broadcastToConversation(conversationId: string, payload: any): void {
  if (!io) {
    console.warn('[Broadcast] Socket.IO not initialized, skipping broadcast');
    return;
  }

  io.to(`conversation:${conversationId}`).emit('message', payload);
}

/**
 * Broadcast to all connected clients
 * @param event Event name
 * @param payload Message payload
 */
export function broadcastToAll(event: string, payload: any): void {
  if (!io) {
    console.warn('[Broadcast] Socket.IO not initialized, skipping broadcast');
    return;
  }

  io.emit(event, payload);
}
