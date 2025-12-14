/**
 * Resilient Messaging Hook
 * 
 * React Hook with automatic fallback and circuit breaker
 * 
 * ARCHITECTURE FIX: P2P now uses unified E2EE (Double Ratchet) via peerUsername,
 * ensuring compatibility with server relay transport.
 * 
 * @module useResilientMessaging
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { MessageRouter } from '@/core/messaging/MessageRouter';
import { P2PTransport } from '@/core/messaging/transports/P2PTransport';
import { WebSocketTransport } from '@/core/messaging/transports/WebSocketTransport';
import type { Message, TransportStatus } from '@/core/messaging/MessageTransport';
import { CircuitBreaker } from '@/core/resilience/CircuitBreaker';
import { useAuthStore } from '@/store/auth';
import { logger } from '@/core/logger';
import { SIGNALING_SERVERS } from '@/config';

export interface UseResilientMessagingOptions {
  signalingUrl?: string;
  onMessage?: (message: Message) => void;
  enableCircuitBreaker?: boolean;
}

export function useResilientMessaging(options: UseResilientMessagingOptions = {}) {
  const session = useAuthStore((state) => state.session);
  const [router, setRouter] = useState<MessageRouter | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreaker | null>(null);
  const [transportStatus, setTransportStatus] = useState<TransportStatus[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);

  // Initialize router and transports
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    const initializeMessaging = async () => {
      try {
        logger.info('Initializing resilient messaging');

        // Create router
        const messageRouter = new MessageRouter({
          maxRetries: 3,
          sendTimeout: 10000,
          autoFallback: true,
        });

        // Register P2P transport (highest priority)
        // ARCHITECTURE FIX: masterKey removed - E2EE handled via peerUsername per message
        const p2pTransport = new P2PTransport(
          userId,
          options.signalingUrl || SIGNALING_SERVERS[0] || ''
        );
        messageRouter.registerTransport(p2pTransport);

        // Register WebSocket transport (fallback)
        const wsTransport = new WebSocketTransport();
        messageRouter.registerTransport(wsTransport);

        // Register message handler
        if (options.onMessage) {
          messageRouter.onMessage(options.onMessage);
        }

        // Initialize all transports
        await messageRouter.initialize();

        setRouter(messageRouter);

        // Create circuit breaker if enabled
        if (options.enableCircuitBreaker !== false) {
          const breaker = new CircuitBreaker('messaging', {
            failureThreshold: 5,
            resetTimeout: 30000,
            successThreshold: 2,
          });
          setCircuitBreaker(breaker);
        }

        setIsInitialized(true);
        logger.info('Resilient messaging initialized');

        // Update transport status periodically
        const statusInterval = setInterval(() => {
          setTransportStatus(messageRouter.getTransportStatus());
        }, 5000);

        return () => {
          clearInterval(statusInterval);
        };
      } catch (error) {
        logger.error('Failed to initialize resilient messaging', error as Error);
        initializingRef.current = false;
      }
    };

    initializeMessaging();

    // Cleanup
    return () => {
      logger.info('Cleaning up resilient messaging');
      router?.destroy();
      circuitBreaker?.destroy();
      initializingRef.current = false;
    };
  }, [session?.user?.id, options.signalingUrl]);

  /**
   * Send message with circuit breaker protection
   */
  const sendMessage = useCallback(
    async (message: Message): Promise<void> => {
      if (!router) {
        throw new Error('Messaging not initialized');
      }

      if (circuitBreaker) {
        // Send with circuit breaker
        await circuitBreaker.execute(() => router.send(message));
      } else {
        // Send directly
        await router.send(message);
      }
    },
    [router, circuitBreaker]
  );

  /**
   * Get preferred transport name
   */
  const getPreferredTransport = useCallback((): string | null => {
    const preferred = router?.getPreferredTransport();
    return preferred?.name || null;
  }, [router]);

  /**
   * Get circuit breaker state
   */
  const getCircuitState = useCallback(() => {
    return circuitBreaker?.getState() || null;
  }, [circuitBreaker]);

  return {
    sendMessage,
    getPreferredTransport,
    getCircuitState,
    transportStatus,
    isInitialized,
    router,
  };
}
