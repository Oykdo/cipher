/**
 * React Hook for P2P Communication
 * 
 * USAGE:
 * const { sendMessage, onlinePeers, isConnected } = useP2P();
 * 
 * FEATURES:
 * - Automatic connection management
 * - Presence detection
 * - Message queueing
 * - Reconnection on disconnect
 * 
 * ARCHITECTURE FIX: P2P now uses unified E2EE (Double Ratchet) via peerUsername,
 * ensuring compatibility with server relay transport.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { P2PManager } from '../lib/p2p/p2p-manager';
import { P2PMessage } from '../lib/p2p/webrtc';
import { useAuthStore } from '../store/auth';

import { debugLogger } from "../lib/debugLogger";
export interface UseP2POptions {
  signalingUrl?: string;
  signalingUrls?: string[]; // Multiple servers for failover
  onMessage?: (conversationId: string, message: P2PMessage) => void;
  onServerSwitch?: (oldUrl: string, newUrl: string) => void;
}

export function useP2P(options: UseP2POptions = {}) {
  const session = useAuthStore((state) => state.session);
  const [manager, setManager] = useState<P2PManager | null>(null);
  const [onlinePeers, setOnlinePeers] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);

  // Initialize P2P manager
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    const initializeP2P = async () => {
      try {
        debugLogger.debug('🚀 [useP2P] Initializing P2P manager (unified E2EE);');

        // ARCHITECTURE FIX: No longer need masterKey - E2EE is handled via peerUsername
        const p2pManager = new P2PManager({
          signalingUrl: options.signalingUrl || 'http://localhost:4000',
          signalingUrls: options.signalingUrls,
          userId,
          authToken: session.accessToken,
          // masterKey removed - P2P now uses unified E2EE via peerUsername
          onMessage: options.onMessage,
          onPeerStatusChange: (peerId, online) => {
            setOnlinePeers((prev) => {
              const next = new Set(prev);
              if (online) {
                next.add(peerId);
              } else {
                next.delete(peerId);
              }
              return next;
            });
          },
          onServerSwitch: options.onServerSwitch,
        });

        try {
          await p2pManager.initialize();
          debugLogger.info('✅ [useP2P] P2P manager initialized');
        } catch (initError) {
          // Initialize anyway - P2P works in degraded mode without signaling
          console.warn('⚠️ [useP2P] P2P manager initialized in degraded mode:', initError);
        }
        
        setManager(p2pManager);
        setIsInitialized(true);
      } catch (error) {
        console.error('❌ [useP2P] Failed to create P2P manager', error);
        initializingRef.current = false;
      }
    };

    initializeP2P();

    // Cleanup on unmount
    return () => {
      debugLogger.websocket('[useP2P]...');
      manager?.destroy();
      initializingRef.current = false;
    };
  }, [session?.user?.id, options.signalingUrl]);

  /**
   * Send message to peer
   * 
   * ARCHITECTURE FIX: Now requires peerUsername for unified E2EE
   */
  const sendMessage = useCallback(
    async (peerId: string, peerUsername: string, conversationId: string, text: string) => {
      if (!manager) {
        throw new Error('P2P manager not initialized');
      }

      await manager.sendMessage(peerId, peerUsername, conversationId, text);
    },
    [manager]
  );

  /**
   * Send typing indicator
   */
  const sendTyping = useCallback(
    async (peerId: string, conversationId: string, isTyping: boolean) => {
      if (!manager) return;
      await manager.sendTyping(peerId, conversationId, isTyping);
    },
    [manager]
  );

  /**
   * Connect to peer
   * 
   * ARCHITECTURE FIX: Now requires peerUsername for unified E2EE
   */
  const connectToPeer = useCallback(
    async (peerId: string, peerUsername: string, conversationId: string, initiator: boolean) => {
      if (!manager) {
        throw new Error('P2P manager not initialized');
      }

      await manager.connectToPeer(peerId, peerUsername, conversationId, initiator);
    },
    [manager]
  );

  /**
   * Check if peer is online
   */
  const isPeerOnline = useCallback(
    (peerId: string): boolean => {
      return onlinePeers.has(peerId);
    },
    [onlinePeers]
  );

  return {
    sendMessage,
    sendTyping,
    connectToPeer,
    isPeerOnline,
    onlinePeers: Array.from(onlinePeers),
    isInitialized,
    manager,
  };
}
