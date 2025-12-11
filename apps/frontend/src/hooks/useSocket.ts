/**
 * useSocket Hook - Socket.IO Client
 * 
 * Hook React pour gérer la connexion WebSocket avec Socket.IO
 * Gère automatiquement la connexion, déconnexion, et les événements
 */

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

interface UseSocketOptions {
  token: string;
  autoConnect?: boolean;
}

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Hook pour gérer la connexion Socket.IO
 */
export function useSocket({ token, autoConnect = true }: UseSocketOptions): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [token, autoConnect]);

  const connect = () => {
    if (socketRef.current?.connected) return;

    try {
      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['polling', 'websocket'], // ✅ Try polling first, then upgrade to websocket
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        setConnected(true);
        setError(null);
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        setConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        setError(err.message);
        setConnected(false);
      });

      socket.on('error', (err) => {
        console.error('[Socket] Error:', err);
        setError(err.message || 'Socket error');
      });

      socketRef.current = socket;
    } catch (err: any) {
      console.error('[Socket] Failed to create socket:', err);
      setError(err.message || 'Failed to create socket');
    }
  };

  /**
   * SECURITY FIX VUL-008: Properly clean up all event listeners
   * Prevents memory leaks and zombie handlers
   */
  const disconnect = () => {
    if (socketRef.current) {
      const socket = socketRef.current;

      // Remove all event listeners before disconnecting
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('error');

      // Also remove any other listeners that might have been added
      socket.removeAllListeners();

      // Now disconnect
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);

      console.log('[Socket] Cleaned up and disconnected');
    }
  };

  return {
    socket: socketRef.current,
    connected,
    error,
    connect,
    disconnect,
  };
}

/**
 * Hook pour écouter des événements Socket.IO
 */
export function useSocketEvent<T = any>(
  socket: Socket | null,
  event: string,
  handler: (data: T) => void
) {
  useEffect(() => {
    if (!socket) return;

    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
}

/**
 * Hook pour rejoindre/quitter une conversation
 */
export function useConversationRoom(
  socket: Socket | null,
  conversationId: string | null
) {
  useEffect(() => {
    if (!socket || !conversationId) return;

    // Join room
    socket.emit('join_conversation', { conversationId });
    console.log('[Socket] Joined conversation:', conversationId);

    return () => {
      // Leave room on unmount
      socket.emit('leave_conversation', { conversationId });
      console.log('[Socket] Left conversation:', conversationId);
    };
  }, [socket, conversationId]);
}

/**
 * Hook pour envoyer un indicateur "en train d'écrire"
 */
export function useTypingIndicator(
  socket: Socket | null,
  conversationId: string | null
) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setTyping = (isTyping: boolean) => {
    if (!socket || !conversationId) return;

    socket.emit('typing', { conversationId, isTyping });

    // Auto-stop typing after 3 seconds
    if (isTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { conversationId, isTyping: false });
      }, 3000);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return { setTyping };
}
