import type { Socket } from 'socket.io-client';

import { signData, verifySignature } from '../e2ee';
import { decryptMessageFromPeer, encryptMessageForPeer, getSigningKeyPair } from '../e2ee/e2eeService';
import { getPublicKey } from '../e2ee/publicKeyService';
import {
  CALL_SIGNATURE_MAX_AGE_MS,
  ReplayProtectionCache,
  isSignatureFresh,
  serializeSignedPayload,
} from './callSecurity';
import { debugLogger } from '../debugLogger';

export type CallMediaType = 'audio' | 'video';
export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'ended' | 'error';
export type MediaSecurityState = 'pending' | 'insertable-e2ee' | 'transport-only';

interface CallSignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface SignedPayload {
  signature?: string;
  signedAt?: number;
}

interface EncryptedCallKeyEnvelope {
  version: 'cipher-call-key-v1';
  key: string;
}

interface IncomingCallPayload {
  from: string;
  conversationId: string;
  mediaType: CallMediaType;
  encryptedCallKey?: string;
}

interface CallSessionMeta {
  peerId: string;
  peerUsername: string;
  conversationId: string;
  mediaType: CallMediaType;
  encryptedCallKey: string;
}

interface MediaCipherContext {
  senderKey: CryptoKey;
  receiverKey: CryptoKey;
}

export interface CallState {
  phase: CallPhase;
  peerId: string | null;
  conversationId: string | null;
  mediaType: CallMediaType | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  error: string | null;
  mediaSecurity: MediaSecurityState;
  peerIdentityVerified: boolean | null;
  eventLog: Array<{ id: string; message: string; timestamp: number }>;
}

type CallListener = (state: CallState) => void;
type PeerUsernameResolver = (peerId: string, conversationId: string) => string | null;

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

interface RTCEncodedFrameLike {
  data: ArrayBuffer;
}

interface EncodedStreamsPair {
  readable: ReadableStream<RTCEncodedFrameLike>;
  writable: WritableStream<RTCEncodedFrameLike>;
}

export class CallManager {
  private socket: Socket;
  private resolvePeerUsername: PeerUsernameResolver;
  private listeners = new Set<CallListener>();
  private state: CallState = INITIAL_STATE;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentSession: CallSessionMeta | null = null;
  private pendingInvite: IncomingCallPayload | null = null;
  private queuedIceCandidates: RTCIceCandidateInit[] = [];
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaCipherContext: MediaCipherContext | null = null;
  private replayProtection = new ReplayProtectionCache(CALL_SIGNATURE_MAX_AGE_MS);

  constructor(socket: Socket, resolvePeerUsername: PeerUsernameResolver) {
    this.socket = socket;
    this.resolvePeerUsername = resolvePeerUsername;
    this.registerSocketHandlers();
  }

  subscribe(listener: CallListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): CallState {
    return this.state;
  }

  async startCall(
    peerId: string,
    peerUsername: string,
    conversationId: string,
    mediaType: CallMediaType
  ): Promise<void> {
    if (!this.socket.connected) {
      this.setTransientState('error', 'Signalisation indisponible.');
      return;
    }

    if (this.state.phase !== 'idle') {
      this.setTransientState('error', 'Un appel est deja en cours.');
      return;
    }

    // Same ownership-transfer pattern as acceptIncomingCall(): hold the
    // acquired MediaStream in a local until it's assigned to
    // this.localStream. handleMediaError → cleanup() only stops tracks
    // on this.localStream, so a throw between acquireLocalStream() and
    // the assignment would otherwise leak mic/camera tracks.
    let pendingStream: MediaStream | null = null;

    try {
      pendingStream = await this.acquireLocalStream(mediaType);
      const callSecret = crypto.getRandomValues(new Uint8Array(32));
      const encryptedCallKey = await this.encryptCallSecretForPeer(peerUsername, callSecret);

      this.currentSession = { peerId, peerUsername, conversationId, mediaType, encryptedCallKey };
      this.localStream = pendingStream;
      pendingStream = null; // ownership transferred — cleanup() will stop the tracks
      this.remoteStream = new MediaStream();
      this.pendingInvite = null;
      this.queuedIceCandidates = [];
      this.mediaCipherContext = await this.createMediaCipherContext(callSecret, true);

      this.setState({
        phase: 'outgoing',
        peerId,
        conversationId,
        mediaType,
        localStream: this.localStream,
        remoteStream: this.remoteStream,
        isMuted: false,
        isVideoEnabled: mediaType === 'video',
        error: null,
        mediaSecurity: this.supportsInsertableStreams() ? 'pending' : 'transport-only',
        peerIdentityVerified: null,
      });
      this.appendEvent(`Invitation ${mediaType === 'video' ? 'video' : 'audio'} envoyee`);

      const invitePayload = {
        to: peerId,
        conversationId,
        mediaType,
        encryptedCallKey,
      };
      this.socket.emit('call:invite', await this.createSignedEnvelope('call:invite', invitePayload));
    } catch (error) {
      pendingStream?.getTracks().forEach((track) => track.stop());
      this.handleMediaError(error);
    }
  }

  async acceptIncomingCall(): Promise<void> {
    if (!this.pendingInvite) {
      return;
    }

    // Claim the invite immediately. acquireLocalStream() and the key
    // exchange below each await for tens of ms; during that window an
    // inbound `call:end`, a user-triggered decline, or even a double
    // acceptIncomingCall() call could otherwise run against the same
    // pendingInvite and corrupt state. Nulling it upfront makes every
    // subsequent handler a no-op on a stale invite, and cleanup() below
    // is idempotent on an already-null pendingInvite.
    const invite = this.pendingInvite;
    this.pendingInvite = null;

    const { from, conversationId, mediaType, encryptedCallKey } = invite;
    const peerUsername = this.resolvePeerUsername(from, conversationId);

    if (!peerUsername || !encryptedCallKey) {
      this.setTransientState('error', 'Impossible de verifier la cle de l appel.');
      this.cleanup(false);
      return;
    }

    // Keep an explicit reference to the acquired MediaStream until we
    // transfer ownership to this.localStream. cleanup() only walks
    // this.localStream, so a failure between acquireLocalStream() and the
    // assignment below would otherwise leak mic/camera tracks and leave
    // the OS recording indicator lit.
    let pendingStream: MediaStream | null = null;

    try {
      pendingStream = await this.acquireLocalStream(mediaType);
      const callSecret = await this.decryptCallSecretFromPeer(peerUsername, encryptedCallKey);

      this.currentSession = {
        peerId: from,
        peerUsername,
        conversationId,
        mediaType,
        encryptedCallKey,
      };
      this.localStream = pendingStream;
      pendingStream = null; // ownership transferred — cleanup() will stop the tracks
      this.remoteStream = new MediaStream();
      this.queuedIceCandidates = [];
      this.mediaCipherContext = await this.createMediaCipherContext(callSecret, false);

      this.ensurePeerConnection();

      this.setState({
        phase: 'connecting',
        peerId: from,
        conversationId,
        mediaType,
        localStream: this.localStream,
        remoteStream: this.remoteStream,
        isMuted: false,
        isVideoEnabled: mediaType === 'video',
        error: null,
        mediaSecurity: this.supportsInsertableStreams() ? 'pending' : 'transport-only',
        peerIdentityVerified: null,
      });
      this.appendEvent('Invitation acceptee');

      const acceptPayload = {
        to: from,
        conversationId,
        mediaType,
      };
      this.socket.emit('call:accept', await this.createSignedEnvelope('call:accept', acceptPayload));
    } catch (error) {
      pendingStream?.getTracks().forEach((track) => track.stop());
      this.setTransientState('error', 'Impossible d etablir la cle media de bout en bout.');
      debugLogger.error('Call key exchange failed', error as Error);
      this.cleanup(false);
    }
  }

  declineIncomingCall(reason: string = 'declined'): void {
    if (!this.pendingInvite) {
      return;
    }

    void this.emitSigned('call:decline', {
      to: this.pendingInvite.from,
      conversationId: this.pendingInvite.conversationId,
      reason,
    });

    this.pendingInvite = null;
    this.appendEvent('Invitation refusee');
    this.cleanup();
  }

  endCall(reason: string = 'ended'): void {
    if (this.currentSession) {
      void this.emitSigned('call:end', {
        to: this.currentSession.peerId,
        conversationId: this.currentSession.conversationId,
        reason,
      });
    }

    this.appendEvent('Appel termine localement');
    this.cleanup();
  }

  toggleMute(): void {
    if (!this.localStream) {
      return;
    }

    const nextMuted = !this.state.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    this.setState({ isMuted: nextMuted });
  }

  toggleVideo(): void {
    if (!this.localStream || this.state.mediaType !== 'video') {
      return;
    }

    const nextVideoEnabled = !this.state.isVideoEnabled;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = nextVideoEnabled;
    });
    this.setState({ isVideoEnabled: nextVideoEnabled });
  }

  destroy(): void {
    this.clearResetTimer();
    this.socket.off('call:invite', this.handleIncomingInvite);
    this.socket.off('call:accept', this.handleCallAccepted);
    this.socket.off('call:decline', this.handleCallDeclined);
    this.socket.off('call:end', this.handleCallEnded);
    this.socket.off('call:signal', this.handleCallSignal);
    this.socket.off('call:unavailable', this.handleCallUnavailable);
    this.cleanup(false);
  }

  private registerSocketHandlers(): void {
    this.socket.on('call:invite', this.handleIncomingInvite);
    this.socket.on('call:accept', this.handleCallAccepted);
    this.socket.on('call:decline', this.handleCallDeclined);
    this.socket.on('call:end', this.handleCallEnded);
    this.socket.on('call:signal', this.handleCallSignal);
    this.socket.on('call:unavailable', this.handleCallUnavailable);
  }

  private handleIncomingInvite = async (payload: IncomingCallPayload & SignedPayload): Promise<void> => {
    if (this.state.phase !== 'idle') {
      void this.emitSigned('call:decline', {
        to: payload.from,
        conversationId: payload.conversationId,
        reason: 'busy',
      });
      return;
    }

    const peerUsername = this.resolvePeerUsername(payload.from, payload.conversationId);
    if (!peerUsername || !payload.encryptedCallKey) {
      void this.emitSigned('call:decline', {
        to: payload.from,
        conversationId: payload.conversationId,
        reason: 'invalid-invite',
      });
      return;
    }

    const verified = await this.verifySignedEnvelope('call:invite', payload.from, {
      conversationId: payload.conversationId,
      mediaType: payload.mediaType,
      encryptedCallKey: payload.encryptedCallKey,
    }, payload.signature, payload.signedAt);
    if (!verified) {
      this.setState({ peerIdentityVerified: false });
      void this.emitSigned('call:decline', {
        to: payload.from,
        conversationId: payload.conversationId,
        reason: 'invalid-signature',
      });
      this.setTransientState('error', 'Signature d appel invalide.');
      return;
    }

    this.pendingInvite = payload;
    this.currentSession = {
      peerId: payload.from,
      peerUsername,
      conversationId: payload.conversationId,
      mediaType: payload.mediaType,
      encryptedCallKey: payload.encryptedCallKey,
    };

    this.setState({
      phase: 'incoming',
      peerId: payload.from,
      conversationId: payload.conversationId,
      mediaType: payload.mediaType,
      error: null,
      mediaSecurity: this.supportsInsertableStreams() ? 'pending' : 'transport-only',
      peerIdentityVerified: true,
    });
    this.appendEvent(`Invitation ${payload.mediaType === 'video' ? 'video' : 'audio'} verifiee`);
  };

  private handleCallAccepted = async (
    payload: Omit<IncomingCallPayload, 'encryptedCallKey'> & SignedPayload
  ): Promise<void> => {
    if (!this.currentSession || this.state.phase !== 'outgoing') {
      return;
    }

    if (
      payload.from !== this.currentSession.peerId ||
      payload.conversationId !== this.currentSession.conversationId
    ) {
      return;
    }

    const verified = await this.verifySignedEnvelope('call:accept', payload.from, {
      conversationId: payload.conversationId,
      mediaType: payload.mediaType,
    }, payload.signature, payload.signedAt);
    if (!verified) {
      this.setState({ peerIdentityVerified: false });
      this.setTransientState('error', 'Acceptation non authentifiee.');
      this.cleanup(false);
      return;
    }

    try {
      this.ensurePeerConnection();
      this.setState({ phase: 'connecting', error: null, peerIdentityVerified: true });
      this.appendEvent('Acceptation verifiee');
      await this.createAndSendOffer();
    } catch (error) {
      this.setTransientState('error', 'Impossible de demarrer l appel.');
      debugLogger.error('Call offer creation failed', error as Error);
      this.cleanup(false);
    }
  };

  private handleCallDeclined = async (payload: { from: string; conversationId: string; reason?: string } & SignedPayload): Promise<void> => {
    if (!this.matchesCurrentSession(payload.from, payload.conversationId)) {
      return;
    }

    const verified = await this.verifySignedEnvelope('call:decline', payload.from, {
      conversationId: payload.conversationId,
      reason: payload.reason,
    }, payload.signature, payload.signedAt);
    if (!verified) {
      this.setState({ peerIdentityVerified: false });
      this.setTransientState('error', 'Refus non authentifie.');
      this.cleanup(false);
      return;
    }

    const message =
      payload.reason === 'busy'
        ? 'Le correspondant est deja en appel.'
        : 'Appel refuse.';

    this.appendEvent(message);
    this.setTransientState('ended', message);
    this.cleanup(false);
  };

  private handleCallEnded = async (payload: { from: string; conversationId: string; reason?: string } & SignedPayload): Promise<void> => {
    if (!this.matchesCurrentSession(payload.from, payload.conversationId)) {
      return;
    }

    const verified = await this.verifySignedEnvelope('call:end', payload.from, {
      conversationId: payload.conversationId,
      reason: payload.reason,
    }, payload.signature, payload.signedAt);
    if (!verified) {
      this.setState({ peerIdentityVerified: false });
      this.setTransientState('error', 'Fin d appel non authentifiee.');
      this.cleanup(false);
      return;
    }

    this.appendEvent('Fin d appel verifiee');
    this.setTransientState('ended', 'Appel termine.');
    this.cleanup(false);
  };

  private handleCallUnavailable = (payload: { peerId: string; conversationId: string }): void => {
    if (!this.matchesCurrentSession(payload.peerId, payload.conversationId)) {
      return;
    }

    this.setTransientState('error', 'Correspondant indisponible.');
    this.cleanup(false);
  };

  private handleCallSignal = async (payload: {
    from: string;
    conversationId: string;
    signal: CallSignalPayload;
  } & SignedPayload): Promise<void> => {
    if (!this.matchesCurrentSession(payload.from, payload.conversationId)) {
      return;
    }

    const verified = await this.verifySignedEnvelope('call:signal', payload.from, {
      conversationId: payload.conversationId,
      signal: payload.signal,
    }, payload.signature, payload.signedAt);
    if (!verified) {
      this.setState({ peerIdentityVerified: false });
      this.setTransientState('error', 'Signal WebRTC non authentifie.');
      this.cleanup(false);
      return;
    }

    try {
      this.ensurePeerConnection();
      this.setState({ peerIdentityVerified: true });
      this.appendEvent('Signal WebRTC verifie');

      if (payload.signal.description) {
        const description = payload.signal.description;
        await this.peerConnection!.setRemoteDescription(description);

        if (description.type === 'offer') {
          this.setState({ phase: 'connecting' });
          const answer = await this.peerConnection!.createAnswer();
          await this.peerConnection!.setLocalDescription(answer);

          await this.emitSigned('call:signal', {
            to: this.currentSession!.peerId,
            conversationId: this.currentSession!.conversationId,
            signal: { description: this.peerConnection!.localDescription?.toJSON() ?? answer },
          });
        }

        await this.flushQueuedIceCandidates();
      }

      if (payload.signal.candidate) {
        if (this.peerConnection!.remoteDescription) {
          await this.peerConnection!.addIceCandidate(payload.signal.candidate);
        } else {
          this.queuedIceCandidates.push(payload.signal.candidate);
        }
      }
    } catch (error) {
      this.setTransientState('error', 'La negociation de l appel a echoue.');
      debugLogger.error('Call signaling failed', error as Error);
      this.cleanup(false);
    }
  };

  private ensurePeerConnection(): void {
    if (this.peerConnection) {
      return;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
      encodedInsertableStreams: this.supportsInsertableStreams(),
    });

    this.peerConnection = peerConnection;
    this.remoteStream = this.remoteStream ?? new MediaStream();

    this.localStream?.getTracks().forEach((track) => {
      const sender = peerConnection.addTrack(track, this.localStream!);
      void this.attachSenderTransform(sender);
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.currentSession) {
        return;
      }

      void this.emitSigned('call:signal', {
        to: this.currentSession.peerId,
        conversationId: this.currentSession.conversationId,
        signal: { candidate: event.candidate.toJSON() },
      });
    };

    peerConnection.ontrack = (event) => {
      void this.attachReceiverTransform(event.receiver);

      if (event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        this.remoteStream ??= new MediaStream();
        this.remoteStream.addTrack(event.track);
      }

      this.setState({
        remoteStream: this.remoteStream,
      });
    };

    peerConnection.onconnectionstatechange = () => {
      const connectionState = peerConnection.connectionState;
      if (connectionState === 'connected') {
        this.setState({ phase: 'connected', error: null });
        this.appendEvent('Canal peer-to-peer etabli');
      }

      if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        this.setTransientState('ended', 'Connexion de l appel interrompue.');
        this.cleanup(false);
      }
    };
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection || !this.currentSession) {
      return;
    }

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.currentSession.mediaType === 'video',
    });

    await this.peerConnection.setLocalDescription(offer);

    await this.emitSigned('call:signal', {
      to: this.currentSession.peerId,
      conversationId: this.currentSession.conversationId,
      signal: { description: this.peerConnection.localDescription?.toJSON() ?? offer },
    });
  }

  private async flushQueuedIceCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      return;
    }

    const queuedCandidates = [...this.queuedIceCandidates];
    this.queuedIceCandidates = [];

    for (const candidate of queuedCandidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
  }

  private async attachSenderTransform(sender: RTCRtpSender): Promise<void> {
    const streams = this.getEncodedStreams(sender);
    if (!streams || !this.mediaCipherContext) {
      this.setState({ mediaSecurity: 'transport-only' });
      this.appendEvent('Insertable Streams indisponible, repli transport WebRTC');
      return;
    }

    const transform = new TransformStream<RTCEncodedFrameLike, RTCEncodedFrameLike>({
      transform: async (frame, controller) => {
        frame.data = await this.encryptFrame(frame.data, this.mediaCipherContext!.senderKey);
        controller.enqueue(frame);
      },
    });

    streams.readable.pipeThrough(transform).pipeTo(streams.writable).catch((error) => {
      this.setState({ mediaSecurity: 'transport-only' });
      debugLogger.warn('Sender insertable stream failed', error as Error);
      this.appendEvent('Echec chiffrement media local, repli transport');
    });

    this.setState({ mediaSecurity: 'insertable-e2ee' });
    this.appendEvent('Chiffrement media sortant active');
  }

  private async attachReceiverTransform(receiver: RTCRtpReceiver): Promise<void> {
    const streams = this.getEncodedStreams(receiver);
    if (!streams || !this.mediaCipherContext) {
      this.setState({ mediaSecurity: 'transport-only' });
      this.appendEvent('Reception media en transport WebRTC chiffre');
      return;
    }

    const transform = new TransformStream<RTCEncodedFrameLike, RTCEncodedFrameLike>({
      transform: async (frame, controller) => {
        frame.data = await this.decryptFrame(frame.data, this.mediaCipherContext!.receiverKey);
        controller.enqueue(frame);
      },
    });

    streams.readable.pipeThrough(transform).pipeTo(streams.writable).catch((error) => {
      this.setState({ mediaSecurity: 'transport-only' });
      debugLogger.warn('Receiver insertable stream failed', error as Error);
      this.appendEvent('Echec dechiffrement media entrant, repli transport');
    });

    this.setState({ mediaSecurity: 'insertable-e2ee' });
    this.appendEvent('Chiffrement media entrant actif');
  }

  private getEncodedStreams(endpoint: RTCRtpSender | RTCRtpReceiver): EncodedStreamsPair | null {
    const candidate = endpoint as RTCRtpSender & {
      createEncodedStreams?: () => EncodedStreamsPair;
    };

    if (typeof candidate.createEncodedStreams === 'function') {
      return candidate.createEncodedStreams();
    }

    return null;
  }

  private supportsInsertableStreams(): boolean {
    return (
      typeof RTCRtpSender !== 'undefined' &&
      typeof (RTCRtpSender.prototype as RTCRtpSender & { createEncodedStreams?: unknown }).createEncodedStreams === 'function'
    );
  }

  private async encryptFrame(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const output = new Uint8Array(iv.length + ciphertext.byteLength);
    output.set(iv, 0);
    output.set(new Uint8Array(ciphertext), iv.length);
    return output.buffer;
  }

  private async decryptFrame(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
    const view = new Uint8Array(data);
    if (view.byteLength < 13) {
      return data;
    }

    const iv = view.slice(0, 12);
    const ciphertext = view.slice(12);

    try {
      return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    } catch {
      this.setState({ mediaSecurity: 'transport-only' });
      return data;
    }
  }

  private async encryptCallSecretForPeer(peerUsername: string, secret: Uint8Array): Promise<string> {
    const envelope: EncryptedCallKeyEnvelope = {
      version: 'cipher-call-key-v1',
      key: this.bytesToBase64(secret),
    };
    const encrypted = await encryptMessageForPeer(peerUsername, JSON.stringify(envelope));
    return JSON.stringify(encrypted);
  }

  private async decryptCallSecretFromPeer(peerUsername: string, encryptedEnvelope: string): Promise<Uint8Array> {
    const parsed = JSON.parse(encryptedEnvelope) as Parameters<typeof decryptMessageFromPeer>[1];
    const plaintext = await decryptMessageFromPeer(peerUsername, parsed);
    const envelope = JSON.parse(plaintext) as EncryptedCallKeyEnvelope;

    if (envelope.version !== 'cipher-call-key-v1') {
      throw new Error('Unsupported call key envelope');
    }

    return this.base64ToBytes(envelope.key);
  }

  private async createMediaCipherContext(secret: Uint8Array, initiator: boolean): Promise<MediaCipherContext> {
    const salt = this.toArrayBuffer(new TextEncoder().encode('cipher-call-media-v1'));
    const baseKey = await crypto.subtle.importKey('raw', this.toArrayBuffer(secret), 'HKDF', false, ['deriveKey']);
    const senderInfo = initiator ? 'initiator->receiver' : 'receiver->initiator';
    const receiverInfo = initiator ? 'receiver->initiator' : 'initiator->receiver';

    const senderKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: this.toArrayBuffer(new TextEncoder().encode(senderInfo)) },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const receiverKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: this.toArrayBuffer(new TextEncoder().encode(receiverInfo)) },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return {
      senderKey,
      receiverKey,
    };
  }

  private async acquireLocalStream(mediaType: CallMediaType): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video:
        mediaType === 'video'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
    });
  }

  private matchesCurrentSession(peerId: string, conversationId: string): boolean {
    return this.currentSession?.peerId === peerId && this.currentSession?.conversationId === conversationId;
  }

  private handleMediaError(error: unknown): void {
    const errorName = error instanceof DOMException ? error.name : '';
    // Specific guidance per DOMException — previously every failure mode
    // collapsed into a single generic message, which made support tickets
    // unresolvable. These are the error names Chromium/Firefox actually
    // surface from getUserMedia().
    const message = (() => {
      switch (errorName) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          return "Accès au micro ou à la caméra refusé. Autorisez l'accès dans les paramètres du navigateur.";
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          return 'Aucun micro ni caméra détecté sur cet appareil.';
        case 'NotReadableError':
        case 'TrackStartError':
          return 'Micro ou caméra déjà utilisé(e) par une autre application.';
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
          return 'Aucun périphérique ne correspond à la qualité demandée (caméra HD indisponible ?).';
        case 'SecurityError':
          return "Accès média bloqué pour raison de sécurité (HTTPS requis).";
        case 'AbortError':
          return 'Démarrage du périphérique média interrompu. Réessayez.';
        case 'TypeError':
          return 'Configuration média invalide.';
        default:
          return "Impossible d'accéder au micro ou à la caméra.";
      }
    })();

    this.setTransientState('error', message);
    debugLogger.error('Call media acquisition failed', error as Error);
    this.cleanup(false);
  }

  private cleanup(resetState: boolean = true): void {
    this.peerConnection?.close();
    this.peerConnection = null;

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream?.getTracks().forEach((track) => track.stop());

    this.localStream = null;
    this.remoteStream = null;
    this.currentSession = null;
    this.pendingInvite = null;
    this.queuedIceCandidates = [];
    this.mediaCipherContext = null;

    if (resetState) {
      this.setState({ ...INITIAL_STATE });
    }
  }

  private async emitSigned(eventName: string, payload: Record<string, unknown>): Promise<void> {
    this.socket.emit(eventName, await this.createSignedEnvelope(eventName, payload));
  }

  private async createSignedEnvelope(
    eventName: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown> & SignedPayload> {
    const signingKeyPair = getSigningKeyPair();
    if (!signingKeyPair) {
      throw new Error('No signing key pair available for call authentication');
    }

    const signedAt = Date.now();
    const body = this.serializeForSignature(eventName, payload, signedAt);
    const signature = await signData(body, signingKeyPair.privateKey);

    return {
      ...payload,
      signedAt,
      signature,
    };
  }

  private async verifySignedEnvelope(
    eventName: string,
    peerId: string,
    payload: Record<string, unknown>,
    signature?: string,
    signedAt?: number
  ): Promise<boolean> {
    if (!signature || !signedAt) {
      return false;
    }

    if (!isSignatureFresh(signedAt)) {
      return false;
    }

    const replayKey = `${eventName}:${peerId}:${signedAt}:${signature}`;
    if (!this.replayProtection.checkAndMark(replayKey)) {
      return false;
    }

    const publicKeyInfo = await getPublicKey(peerId);
    if (!publicKeyInfo?.signPublicKey) {
      return false;
    }

    const body = this.serializeForSignature(eventName, payload, signedAt);
    return verifySignature(body, signature, publicKeyInfo.signPublicKey);
  }

  private serializeForSignature(
    eventName: string,
    payload: Record<string, unknown>,
    signedAt: number
  ): string {
    return serializeSignedPayload(eventName, payload, signedAt);
  }

  private setTransientState(phase: Extract<CallPhase, 'ended' | 'error'>, error: string): void {
    this.clearResetTimer();
    this.setState({ phase, error });
    this.resetTimer = setTimeout(() => {
      this.setState({ ...INITIAL_STATE });
      this.resetTimer = null;
    }, 2200);
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  private setState(partial: Partial<CallState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private appendEvent(message: string): void {
    const timestamp = Date.now();
    const currentLog = this.state.eventLog ?? [];
    const nextLog = [
      ...currentLog,
      {
        id: `${timestamp}-${currentLog.length}`,
        message,
        timestamp,
      },
    ].slice(-8);

    this.setState({ eventLog: nextLog });
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      output[i] = binary.charCodeAt(i);
    }
    return output;
  }

  private toArrayBuffer(value: Uint8Array): ArrayBuffer {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
}
