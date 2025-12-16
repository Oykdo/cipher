/**
 * useSocket Hook with Auto-Reconnect on Token Refresh
 * 
 * ARCHITECTURE: Gère automatiquement la reconnexion WebSocket lors du refresh token
 * 
 * Features:
 * - Auto-reconnect when token changes
 * - Handles authentication errors gracefully
 * - Automatic cleanup
 * - Listens to auth store changes
 */

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth';

import { debugLogger } from "../lib/debugLogger";
import { SOCKET_BASE_URL } from '../config';

const SOCKET_URL = SOCKET_BASE_URL;

interface UseSocketWithRefreshReturn {
  socket: Socket | null;
  connected: boolean;
  error: string | null;
  reconnect: () => void;
}

/**
 * Hook pour gérer la connexion Socket.IO avec auto-reconnect sur token refresh
 * 
 * @returns Socket instance, connection status, and reconnect function
 */
export function useSocketWithRefresh(): UseSocketWithRefreshReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Écouter les changements de session
  const session = useAuthStore((state) => state.session);
  const token = session?.accessToken;

  /**
   * Connecte ou reconnecte le socket avec le token actuel
   */
  const connect = () => {
    if (!token) {
      console.warn('[useSocket] No token available, skipping connection');
      return;
    }

    // Déconnecter l'ancien socket si existant
    if (socketRef.current) {
      debugLogger.debug('[useSocket] Disconnecting old socket');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      // SECURITY: Sensitive log removed
      
      const socket = io(SOCKET_URL, {
        auth: {
          token,
        },
        // Prefer polling first, then upgrade to websocket.
        // This avoids noisy console errors on hosts/proxies that occasionally reject the initial WS handshake.
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      // Event: Connection successful
      socket.on('connect', () => {
        debugLogger.debug('[useSocket] Connected:', socket.id);
        setConnected(true);
        setError(null);
      });

      // Event: Connection error
      socket.on('connect_error', (err) => {
        console.error('[useSocket] Connection error:', err.message);
        setError(err.message);
        setConnected(false);
        
        // Si erreur d'authentification, ne pas retry automatiquement
        if (err.message.includes('Authentication') || err.message.includes('token')) {
          console.warn('[useSocket] Authentication error, stopping reconnection');
          socket.disconnect();
        }
      });

      // Event: Disconnection
      socket.on('disconnect', (reason) => {
        debugLogger.debug('[useSocket] Disconnected:', reason);
        setConnected(false);
        
        // Si déconnexion par le serveur (token expiré), attendre le refresh
        if (reason === 'io server disconnect') {
          // SECURITY: Sensitive log removed
        }
      });

      // Event: Reconnection attempt
      socket.on('reconnect_attempt', (attempt) => {
        debugLogger.debug(`[useSocket] Reconnection attempt ${attempt}`);
      });

      // Event: Reconnection failed
      socket.on('reconnect_failed', () => {
        console.error('[useSocket] Reconnection failed after all attempts');
        setError('Failed to reconnect to server');
      });

      socketRef.current = socket;
    } catch (err) {
      console.error('[useSocket] Failed to create socket:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  /**
   * Déconnecte le socket
   */
  const disconnect = () => {
    if (socketRef.current) {
      debugLogger.debug('[useSocket] Disconnecting socket');
      // Remove all listeners before disconnecting to avoid warnings
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  };

  /**
   * Force une reconnexion
   */
  const reconnect = () => {
    debugLogger.debug('[useSocket] Manual reconnect triggered');
    disconnect();
    connect();
  };

  // Effect: Connect/reconnect when token changes
  useEffect(() => {
    if (!token) {
      // SECURITY: Sensitive log removed
      disconnect();
      return;
    }

    // SECURITY: Sensitive log removed
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [token]); // Reconnect when token changes

  return {
    socket: socketRef.current,
    connected,
    error,
    reconnect,
  };
}

/**
 * Hook pour écouter des événements Socket.IO
 * 
 * @param socket - Socket instance
 * @param event - Event name
 * @param handler - Event handler
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
 * Hook pour émettre des événements Socket.IO
 * 
 * @param socket - Socket instance
 * @returns Emit function
 */
export function useSocketEmit(socket: Socket | null) {
  return <T = any>(event: string, data: T) => {
    if (!socket || !socket.connected) {
      console.warn(`[useSocket] Cannot emit "${event}": socket not connected`);
      return;
    }

    socket.emit(event, data);
  };
}
