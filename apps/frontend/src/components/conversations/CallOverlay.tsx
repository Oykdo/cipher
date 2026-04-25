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

const ICON = {
  mic: (
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm7 9a7 7 0 0 1-14 0M12 18v3" />
  ),
  micOff: (
    <>
      <path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M5 11a7 7 0 0 0 11.95 4.95M19 11a7 7 0 0 1-1.05 3.7M12 18v3M3 3l18 18" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4z" />
    </>
  ),
  videoOff: (
    <>
      <path d="M16 16v.5A1.5 1.5 0 0 1 14.5 18h-11A1.5 1.5 0 0 1 2 16.5v-9A1.5 1.5 0 0 1 3.5 6H7" />
      <path d="m22 8-6 4 6 4z" />
      <path d="M3 3l18 18" />
    </>
  ),
  phoneEnd: (
    <path d="M3 11a16 16 0 0 1 18 0v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a8 8 0 0 0-6 0v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  phoneAccept: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
  ),
  expand: (
    <>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </>
  ),
  collapse: (
    <>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </>
  ),
};

function Icon({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CircleButton({
  onClick,
  variant = 'neutral',
  ariaLabel,
  children,
}: {
  onClick: () => void;
  variant?: 'neutral' | 'danger' | 'accept' | 'muted';
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const base =
    'flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition active:scale-95';
  const styles = {
    neutral:
      'border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] text-white hover:bg-[rgba(255,255,255,0.12)]',
    muted:
      'border border-[rgba(0,240,255,0.22)] bg-[rgba(0,240,255,0.10)] text-[var(--cosmic-cyan)] hover:bg-[rgba(0,240,255,0.18)]',
    danger:
      'bg-rose-500/90 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] hover:bg-rose-500',
    accept:
      'bg-emerald-500/90 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)] hover:bg-emerald-500',
  };
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
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
  const isPulsing =
    callState.phase === 'outgoing' ||
    callState.phase === 'connecting' ||
    callState.phase === 'incoming';

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
        ? 'Sonnerie...'
        : callState.phase === 'connecting'
          ? 'Connexion...'
          : callState.phase === 'connected'
            ? 'En communication'
            : callState.error ?? 'Appel termine';

  const secureMedia = callState.mediaSecurity === 'insertable-e2ee';
  const identityVerified = callState.peerIdentityVerified === true;
  const identityFailed = callState.peerIdentityVerified === false;

  const toggleFullscreen = () => {
    const el = videoStageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  };

  const initial = peerLabel.slice(0, 1).toUpperCase();

  // ---------------------------------------------------------------------------
  // VIDEO LAYOUT — full-bleed remote, floating control dock.
  // ---------------------------------------------------------------------------
  if (isVideoCall) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(2,6,23,0.90)] backdrop-blur-md">
        <div
          ref={videoStageRef}
          className="relative h-[min(86vh,720px)] w-[min(94vw,1100px)] overflow-hidden rounded-[28px] border border-[rgba(0,240,255,0.18)] shadow-[0_25px_120px_rgba(0,0,0,0.55)]"
          style={{
            background:
              'radial-gradient(circle at top, rgba(0,240,255,0.10), rgba(4,9,22,0.98) 60%)',
          }}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          {(!callState.remoteStream || !remoteHasVideo) && (
            <CosmicHero
              initial={initial}
              peerLabel={peerLabel}
              statusLabel={
                callState.remoteStream && !remoteHasVideo
                  ? 'Caméra du correspondant coupée'
                  : statusLabel
              }
              pulsing={isPulsing}
            />
          )}

          {/* Top-right: fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.45)] text-white backdrop-blur hover:bg-[rgba(0,0,0,0.65)]"
          >
            <Icon size={16}>{isFullscreen ? ICON.collapse : ICON.expand}</Icon>
          </button>

          {/* Top-left: discreet identity/security indicator */}
          <SecurityChip secureMedia={secureMedia} identityVerified={identityVerified} identityFailed={identityFailed} />

          {/* Local preview */}
          {callState.localStream && (
            <div className="absolute bottom-24 right-5 aspect-video w-52 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.18)] bg-[rgba(0,0,0,0.55)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!callState.isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(3,9,20,0.88)] text-[10px] uppercase tracking-[0.2em] text-soft-grey">
                  Caméra coupée
                </div>
              )}
            </div>
          )}

          {/* Floating dock at bottom */}
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <div className="flex items-center gap-3 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(8,14,29,0.72)] px-4 py-3 backdrop-blur-xl">
              {callState.phase === 'incoming' ? (
                <>
                  <CircleButton onClick={onAccept} variant="accept" ariaLabel="Répondre">
                    <Icon>{ICON.phoneAccept}</Icon>
                  </CircleButton>
                  <CircleButton onClick={onDecline} variant="danger" ariaLabel="Refuser">
                    <Icon>{ICON.phoneEnd}</Icon>
                  </CircleButton>
                </>
              ) : (
                <>
                  <CircleButton
                    onClick={onToggleMute}
                    variant={callState.isMuted ? 'muted' : 'neutral'}
                    ariaLabel={callState.isMuted ? 'Réactiver le micro' : 'Couper le micro'}
                  >
                    <Icon>{callState.isMuted ? ICON.micOff : ICON.mic}</Icon>
                  </CircleButton>
                  <CircleButton
                    onClick={onToggleVideo}
                    variant={callState.isVideoEnabled ? 'neutral' : 'muted'}
                    ariaLabel={callState.isVideoEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                  >
                    <Icon>{callState.isVideoEnabled ? ICON.video : ICON.videoOff}</Icon>
                  </CircleButton>
                  <CircleButton onClick={onEnd} variant="danger" ariaLabel="Raccrocher">
                    <Icon>{ICON.phoneEnd}</Icon>
                  </CircleButton>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // AUDIO LAYOUT — single hero, vertical rhythm.
  // ---------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(2,6,23,0.90)] backdrop-blur-md">
      <div
        className="relative w-[min(92vw,440px)] overflow-hidden rounded-[28px] border border-[rgba(0,240,255,0.18)] px-8 py-10 text-center shadow-[0_25px_120px_rgba(0,0,0,0.55)]"
        style={{
          background:
            'radial-gradient(circle at top, rgba(0,240,255,0.14), rgba(4,9,22,0.98) 65%)',
        }}
      >
        <SecurityChip
          secureMedia={secureMedia}
          identityVerified={identityVerified}
          identityFailed={identityFailed}
          inline
        />

        <div className="mt-2 flex justify-center">
          <CosmicAvatar initial={initial} pulsing={isPulsing} />
        </div>

        <h3 className="mt-7 text-2xl font-bold tracking-tight text-pure-white">{peerLabel}</h3>
        <p className="mt-1 text-sm text-soft-grey">{statusLabel}</p>

        <div className="mt-9 flex justify-center gap-3">
          {callState.phase === 'incoming' ? (
            <>
              <CircleButton onClick={onDecline} variant="danger" ariaLabel="Refuser">
                <Icon>{ICON.phoneEnd}</Icon>
              </CircleButton>
              <CircleButton onClick={onAccept} variant="accept" ariaLabel="Répondre">
                <Icon>{ICON.phoneAccept}</Icon>
              </CircleButton>
            </>
          ) : (
            <>
              <CircleButton
                onClick={onToggleMute}
                variant={callState.isMuted ? 'muted' : 'neutral'}
                ariaLabel={callState.isMuted ? 'Réactiver le micro' : 'Couper le micro'}
              >
                <Icon>{callState.isMuted ? ICON.micOff : ICON.mic}</Icon>
              </CircleButton>
              <CircleButton onClick={onEnd} variant="danger" ariaLabel="Raccrocher">
                <Icon>{ICON.phoneEnd}</Icon>
              </CircleButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CosmicAvatar({ initial, pulsing }: { initial: string; pulsing: boolean }) {
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      {pulsing && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border border-[rgba(0,240,255,0.30)] [animation-duration:2.4s]" />
          <span className="absolute inset-2 animate-ping rounded-full border border-[rgba(0,240,255,0.18)] [animation-duration:2.4s] [animation-delay:0.6s]" />
        </>
      )}
      <span
        className="relative flex h-32 w-32 items-center justify-center rounded-full text-5xl font-black"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(0,240,255,0.32), rgba(0,240,255,0.05) 70%)',
          border: '1px solid rgba(0,240,255,0.28)',
          color: 'var(--cosmic-cyan)',
          boxShadow: '0 0 60px rgba(0,240,255,0.15)',
        }}
      >
        {initial}
      </span>
    </div>
  );
}

function CosmicHero({
  initial,
  peerLabel,
  statusLabel,
  pulsing,
}: {
  initial: string;
  peerLabel: string;
  statusLabel: string;
  pulsing: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(3,9,20,0.78)] text-center">
      <CosmicAvatar initial={initial} pulsing={pulsing} />
      <div className="mt-6 text-2xl font-bold text-pure-white">{peerLabel}</div>
      <div className="mt-1 text-sm text-soft-grey">{statusLabel}</div>
    </div>
  );
}

function SecurityChip({
  secureMedia,
  identityVerified,
  identityFailed,
  inline = false,
}: {
  secureMedia: boolean;
  identityVerified: boolean;
  identityFailed: boolean;
  inline?: boolean;
}) {
  // Hide entirely when there's nothing meaningful to show: media not yet secure
  // AND identity not yet verified / not failed.
  if (!secureMedia && !identityVerified && !identityFailed) {
    return null;
  }

  const wrapper = inline
    ? 'inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-soft-grey'
    : 'absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(8,14,29,0.55)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-soft-grey backdrop-blur';

  return (
    <div className={wrapper}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          identityFailed
            ? 'bg-rose-400'
            : secureMedia && identityVerified
              ? 'bg-emerald-400'
              : 'bg-[var(--cosmic-cyan)]'
        }`}
      />
      <span>
        {identityFailed
          ? 'Identité non vérifiée'
          : secureMedia && identityVerified
            ? 'E2EE vérifié'
            : secureMedia
              ? 'E2EE actif'
              : 'Sécurisation...'}
      </span>
    </div>
  );
}
