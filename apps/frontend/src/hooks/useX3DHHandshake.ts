/**
 * useX3DHHandshake Hook
 * 
 * Manages X3DH handshake messages over WebSocket
 * Configures the E2EE service to send/receive handshake messages
 */

import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  setHandshakeMessageSender,
  handleIncomingHandshakeMessage,
} from '../lib/e2ee/e2eeService';
import { isHandshakeMessage } from '../lib/e2ee/x3dhManager';

import { debugLogger } from "../lib/debugLogger";
interface UseX3DHHandshakeOptions {
  socket: Socket | null;
  connected: boolean;
}

/**
 * Hook to integrate X3DH handshake with WebSocket
 * 
 * Usage:
 * ```tsx
 * const { isReady } = useX3DHHandshake({ socket, connected });
 * ```
 */
export function useX3DHHandshake({ socket, connected }: UseX3DHHandshakeOptions) {
  const isConfigured = useRef(false);

  // Configure the handshake message sender
  useEffect(() => {
    if (!socket || !connected) return;

    // Create sender function that uses WebSocket
    const sendHandshakeMessage = async (peerUsername: string, message: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        // Send via WebSocket as a special handshake message type
        socket.emit('x3dh_handshake', {
          targetUsername: peerUsername,
          handshakeData: message,
          timestamp: Date.now(),
        }, (response: { success: boolean; error?: string }) => {
          if (response?.success) {
            debugLogger.debug(`📤 [X3DH] Handshake message sent to ${peerUsername}`);
            resolve();
          } else {
            console.error(`❌ [X3DH] Failed to send handshake:`, response?.error);
            reject(new Error(response?.error || 'Failed to send handshake'));
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Handshake send timeout'));
        }, 10000);
      });
    };

    // Configure E2EE service
    setHandshakeMessageSender(sendHandshakeMessage);
    isConfigured.current = true;
    // SECURITY: crypto log removed

    return () => {
      isConfigured.current = false;
    };
  }, [socket, connected]);

  // Listen for incoming handshake messages
  useEffect(() => {
    if (!socket) return;

    const handleHandshake = async (data: {
      senderUsername: string;
      handshakeData: string;
      timestamp: number;
    }) => {
      let handshakeType: string | undefined;
      let sessionId: string | undefined;
      try {
        const parsed = JSON.parse(data.handshakeData);
        handshakeType = parsed?.type;
        sessionId = parsed?.sessionId;
      } catch {
        // Ignore
      }

      debugLogger.debug(`📨 [X3DH Hook] Received handshake from ${data.senderUsername} (${handshakeType || 'unknown'}${sessionId ? `:${sessionId}` : ''})`);

      try {
        // Process the handshake message
        const handled = await handleIncomingHandshakeMessage(
          data.senderUsername,
          data.handshakeData
        );

        if (handled) {
          debugLogger.info('✅ [X3DH Hook] Handshake processed from ${data.senderUsername}');
        }
      } catch (error) {
        console.error(`❌ [X3DH Hook] Failed to process handshake:`, error);
      }
    };

    socket.on('x3dh_handshake', handleHandshake);

    return () => {
      socket.off('x3dh_handshake', handleHandshake);
    };
  }, [socket]);

  return {
    isReady: isConfigured.current && connected,
  };
}

/**
 * Check if a message body contains an X3DH handshake
 * Useful for filtering handshake messages from regular messages
 */
export function isX3DHHandshakeMessage(messageBody: string): boolean {
  return isHandshakeMessage(messageBody);
}
