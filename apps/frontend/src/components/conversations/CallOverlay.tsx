import { useEffect, useRef } from 'react';

import type { CallState } from '../../lib/calls/CallManager';

interface CallOverlayProps {
  callState: CallState;
  peerLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}

export function CallOverlay({
  callState,
  peerLabel,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleVideo,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const isVideoCall = callState.mediaType === 'video';
  const showOverlay = callState.phase !== 'idle';

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  if (!showOverlay) {
    return null;
  }

  const statusLabel =
    callState.phase === 'incoming'
      ? `Appel ${isVideoCall ? 'video' : 'audio'} entrant`
      : callState.phase === 'outgoing'
        ? `Appel ${isVideoCall ? 'video' : 'audio'} en cours`
        : callState.phase === 'connecting'
          ? 'Connexion securisee en cours'
          : callState.phase === 'connected'
            ? 'Canal chiffre actif'
            : callState.error ?? 'Appel termine';

  const securityLabel =
    callState.mediaSecurity === 'insertable-e2ee'
      ? 'Media E2EE actif'
      : callState.mediaSecurity === 'transport-only'
        ? 'Transport WebRTC chiffre'
        : 'Activation media E2EE';
  const identityLabel =
    callState.peerIdentityVerified === true
      ? 'Identite verifiee'
      : callState.peerIdentityVerified === false
        ? 'Identite non verifiee'
        : 'Verification identite';

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(2,6,23,0.86)] backdrop-blur-md">
      <div className="relative w-[min(92vw,900px)] overflow-hidden rounded-[28px] border border-[rgba(0,240,255,0.22)] bg-[radial-gradient(circle_at_top,rgba(0,240,255,0.18),rgba(8,14,29,0.96)_58%)] shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[1.2fr_0.8fr]">
          <div className="relative min-h-[320px] border-b border-[rgba(255,255,255,0.08)] bg-[rgba(3,9,20,0.65)] md:border-b-0 md:border-r">
            {isVideoCall ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-full min-h-[320px] w-full object-cover"
                />
                {!callState.remoteStream && (
                  <div className="absolute inset-0 flex items-center justify-center text-center text-soft-grey">
                    <div>
                      <div className="text-xs uppercase tracking-[0.3em] text-[var(--cosmic-cyan)]">Secure Link</div>
                      <div className="mt-3 text-2xl font-black text-pure-white">{peerLabel}</div>
                      <div className="mt-2 text-sm">{statusLabel}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center text-center">
                <div className="flex h-36 w-36 items-center justify-center rounded-full border border-[rgba(0,240,255,0.22)] bg-[rgba(0,240,255,0.08)] text-5xl font-black text-[var(--cosmic-cyan)]">
                  {peerLabel.slice(0, 1).toUpperCase()}
                </div>
              </div>
            )}

            {isVideoCall && callState.localStream && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 h-28 w-24 rounded-2xl border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.35)] object-cover shadow-lg"
              />
            )}
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--cosmic-cyan)]">Cipher Call</div>
              <h3 className="mt-3 text-3xl font-black text-pure-white">{peerLabel}</h3>
              <p className="mt-3 text-sm text-soft-grey">{statusLabel}</p>
              <div className="mt-4 inline-flex rounded-full border border-[rgba(0,240,255,0.22)] bg-[rgba(0,240,255,0.08)] px-3 py-1 text-xs text-[var(--cosmic-cyan)]">
                {securityLabel}
              </div>
              <div className="mt-3 inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-3 py-1 text-xs text-white">
                {identityLabel}
              </div>

              {callState.eventLog.length > 0 && (
                <div className="mt-5 rounded-2xl border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-soft-grey">Journal</div>
                  <div className="mt-3 space-y-2">
                    {callState.eventLog.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="text-white/90">{entry.message}</span>
                        <span className="shrink-0 text-soft-grey">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {callState.phase === 'incoming' ? (
                <>
                  <button onClick={onAccept} className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white">
                    Repondre
                  </button>
                  <button onClick={onDecline} className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white">
                    Refuser
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onToggleMute}
                    className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-sm font-semibold text-white"
                  >
                    {callState.isMuted ? 'Micro coupe' : 'Micro actif'}
                  </button>

                  {isVideoCall && (
                    <button
                      onClick={onToggleVideo}
                      className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-sm font-semibold text-white"
                    >
                      {callState.isVideoEnabled ? 'Camera active' : 'Camera coupee'}
                    </button>
                  )}

                  <button onClick={onEnd} className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white">
                    Raccrocher
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
