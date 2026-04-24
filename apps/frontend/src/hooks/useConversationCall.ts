import { useCallback, useEffect, useRef, useState } from 'react';

import type { P2PManager } from '../lib/p2p/p2p-manager';
import { CallManager, type CallMediaType, type CallState } from '../lib/calls/CallManager';

const INITIAL_STATE: CallState = {
  phase: 'idle',
  peerId: null,
  conversationId: null,
  mediaType: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoEnabled: true,
  error: null,
  mediaSecurity: 'pending',
  peerIdentityVerified: null,
  eventLog: [],
};

export function useConversationCall(
  manager: P2PManager | null,
  resolvePeerUsername: (peerId: string, conversationId: string) => string | null
) {
  // Stabilise la fonction resolver : les consommateurs de ce hook passent
  // typiquement un useCallback qui dépend de `conversations`, array qui
  // change à chaque message / typing indicator / delivery receipt. Sans ce
  // ref, le useEffect ci-dessous re-montait le CallManager en boucle,
  // ce qui : (1) détachait les handlers socket call:invite / call:accept /
  // call:signal en plein vol et faisait perdre l'invite côté récepteur,
  // (2) wipait l'état du CallManager en plein appel (écran noir → retour
  // idle). On garde donc une référence stable vers le dernier resolver, et
  // on expose un wrapper useCallback sans dépendance.
  const resolverRef = useRef(resolvePeerUsername);
  resolverRef.current = resolvePeerUsername;
  const stableResolver = useCallback(
    (peerId: string, conversationId: string) => resolverRef.current(peerId, conversationId),
    []
  );

  const [callState, setCallState] = useState<CallState>(INITIAL_STATE);
  const [callManager, setCallManager] = useState<CallManager | null>(null);

  useEffect(() => {
    const socket = manager?.getSignalingClient().getSocket();
    if (!socket) {
      setCallManager(null);
      setCallState(INITIAL_STATE);
      return;
    }

    const nextManager = new CallManager(socket, stableResolver);
    setCallManager(nextManager);

    const unsubscribe = nextManager.subscribe(setCallState);

    return () => {
      unsubscribe();
      nextManager.destroy();
      setCallManager(null);
      setCallState(INITIAL_STATE);
    };
  }, [manager, stableResolver]);

  return {
    callState,
    isCallActive: callState.phase !== 'idle',
    startCall: async (peerId: string, peerUsername: string, conversationId: string, mediaType: CallMediaType) => {
      await callManager?.startCall(peerId, peerUsername, conversationId, mediaType);
    },
    acceptCall: async () => {
      await callManager?.acceptIncomingCall();
    },
    declineCall: (reason?: string) => {
      callManager?.declineIncomingCall(reason);
    },
    endCall: (reason?: string) => {
      callManager?.endCall(reason);
    },
    toggleMute: () => {
      callManager?.toggleMute();
    },
    toggleVideo: () => {
      callManager?.toggleVideo();
    },
  };
}
