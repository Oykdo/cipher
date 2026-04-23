import { useEffect, useRef, useState } from 'react';

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
  const videoStageRef = useRef<HTMLDivElement>(null);
  const isVideoCall = callState.mediaType === 'video';
  const showOverlay = callState.phase !== 'idle';

  // Track whether the remote peer is actually sending video. The remoteStream
  // reference stays stable across the call (CallManager mutates it in place
  // via ontrack), so we subscribe to addtrack/removetrack + the tracks' own
  // mute/unmute events to know when to swap to the "Secure Link" placeholder.
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

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

  useEffect(() => {
    const stream = callState.remoteStream;
    if (!stream) {
      setRemoteHasVideo(false);
      return;
    }

    const trackCleanups: Array<() => void> = [];

    const refresh = () => {
      // Drop stale track listeners before re-attaching.
      while (trackCleanups.length) {
        const dispose = trackCleanups.pop();
        dispose?.();
      }

      const videoTracks = stream.getVideoTracks();
      setRemoteHasVideo(videoTracks.some((t) => t.enabled && !t.muted));

      videoTracks.forEach((track) => {
        const onStateChange = () => setRemoteHasVideo(track.enabled && !track.muted);
        track.addEventListener('mute', onStateChange);
        track.addEventListener('unmute', onStateChange);
        track.addEventListener('ended', onStateChange);
        trackCleanups.push(() => {
          track.removeEventListener('mute', onStateChange);
          track.removeEventListener('unmute', onStateChange);
          track.removeEventListener('ended', onStateChange);
        });
      });
    };

    refresh();
    stream.addEventListener('addtrack', refresh);
    stream.addEventListener('removetrack', refresh);

    return () => {
      stream.removeEventListener('addtrack', refresh);
      stream.removeEventListener('removetrack', refresh);
      trackCleanups.forEach((dispose) => dispose());
    };
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

  const toggleFullscreen = () => {
    const el = videoStageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(2,6,23,0.86)] backdrop-blur-md">
      <div className="relative w-[min(92vw,900px)] overflow-hidden rounded-[28px] border border-[rgba(0,240,255,0.22)] bg-[radial-gradient(circle_at_top,rgba(0,240,255,0.18),rgba(8,14,29,0.96)_58%)] shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[1.2fr_0.8fr]">
          <div
            ref={videoStageRef}
            className="relative min-h-[320px] border-b border-[rgba(255,255,255,0.08)] bg-[rgba(3,9,20,0.65)] md:border-b-0 md:border-r"
          >
            {isVideoCall ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-full min-h-[320px] w-full object-cover"
                />
                {(!callState.remoteStream || !remoteHasVideo) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[rgba(3,9,20,0.72)] text-center text-soft-grey">
                    <div>
                      <div className="text-xs uppercase tracking-[0.3em] text-[var(--cosmic-cyan)]">Secure Link</div>
                      <div className="mt-3 text-2xl font-black text-pure-white">{peerLabel}</div>
                      <div className="mt-2 text-sm">
                        {callState.remoteStream && !remoteHasVideo ? 'Caméra du correspondant coupée' : statusLabel}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fullscreen toggle — only meaningful for video calls. */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
                  className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.45)] text-white hover:bg-[rgba(0,0,0,0.65)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {isFullscreen ? (
                      <>
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </>
                    ) : (
                      <>
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </>
                    )}
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center text-center">
                <div className="flex h-36 w-36 items-center justify-center rounded-full border border-[rgba(0,240,255,0.22)] bg-[rgba(0,240,255,0.08)] text-5xl font-black text-[var(--cosmic-cyan)]">
                  {peerLabel.slice(0, 1).toUpperCase()}
                </div>
              </div>
            )}

            {isVideoCall && callState.localStream && (
              <div className="absolute bottom-4 right-4 aspect-video w-60 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.18)] bg-[rgba(0,0,0,0.55)] shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  // Mirror the self-preview horizontally so users see themselves
                  // the way a mirror would — standard UX across every mainstream
                  // video-call app. The remote peer still receives a non-mirrored
                  // feed since only the local rendering is flipped.
                  className="h-full w-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!callState.isVideoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[rgba(3,9,20,0.88)] text-[11px] uppercase tracking-[0.2em] text-soft-grey">
                    Caméra coupée
                  </div>
                )}
              </div>
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
