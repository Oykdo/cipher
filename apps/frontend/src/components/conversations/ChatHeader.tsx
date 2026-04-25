import { useTranslation } from 'react-i18next';
import type { ConversationSummaryV2 } from '../../services/api-v2';
import type { CallState } from '../../lib/calls/CallManager';

export type ConnectionMode = 'p2p' | 'relayed' | 'connecting';
export type EncryptionMode = 'nacl-box' | 'double-ratchet';

interface ChatHeaderProps {
  conversation: ConversationSummaryV2;
  onlineUsers: Set<string>;
  onBackToList: () => void;
  connectionMode?: ConnectionMode;
  onEncryptionModeChange?: (mode: EncryptionMode) => void;
  callState?: CallState;
  onStartAudioCall?: () => void;
  onStartVideoCall?: () => void;
  onEndCall?: () => void;
}

export function ChatHeader({
  conversation,
  onlineUsers,
  onBackToList,
  callState,
  onStartAudioCall,
  onStartVideoCall,
  onEndCall,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const isOnline = onlineUsers.has(conversation.otherParticipant.id);
  const isThisConversationCall =
    callState?.phase !== 'idle' && callState?.conversationId === conversation.id;
  const callBusyElsewhere =
    callState?.phase !== 'idle' && callState?.conversationId !== conversation.id;
  const callDisabled = !isOnline || callBusyElsewhere;

  return (
    <div className="p-4 border-b border-[rgba(0,240,255,0.12)] bg-[rgba(6,12,26,0.82)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={onBackToList}
            aria-label={t('common.back')}
            title={t('common.back')}
            className={[
              'md:hidden group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur',
              'border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] text-soft-grey',
              'transition-all duration-150 ease-out active:scale-95',
              'hover:border-[rgba(0,240,255,0.40)] hover:bg-[rgba(0,240,255,0.10)] hover:text-[var(--cosmic-cyan)] hover:shadow-[0_0_20px_rgba(0,240,255,0.28)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cosmic-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,12,26,0.82)]',
            ].join(' ')}
          >
            <BackArrowIcon />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-pure-white flex items-center gap-2">
              <span className="truncate">{conversation.otherParticipant.username}</span>
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
                title={isOnline ? t('common.online') : t('common.offline')}
              />
            </h2>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isThisConversationCall ? (
            <CallButton
              variant="end"
              onClick={onEndCall}
              ariaLabel={t('conversations.end_call', 'End encrypted call')}
            >
              <PhoneEndIcon />
            </CallButton>
          ) : (
            <>
              <CallButton
                variant="audio"
                onClick={onStartAudioCall}
                disabled={callDisabled}
                ariaLabel={t('conversations.start_audio_call', 'Start encrypted audio call')}
              >
                <PhoneIcon />
              </CallButton>
              <CallButton
                variant="video"
                onClick={onStartVideoCall}
                disabled={callDisabled}
                ariaLabel={t('conversations.start_video_call', 'Start encrypted video call')}
              >
                <VideoIcon />
              </CallButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type CallButtonVariant = 'audio' | 'video' | 'end';

function CallButton({
  variant,
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  variant: CallButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const palette = {
    audio: {
      base: 'border-[rgba(0,240,255,0.32)] bg-[rgba(0,240,255,0.10)] text-[var(--cosmic-cyan)]',
      hover: 'hover:border-[rgba(0,240,255,0.55)] hover:bg-[rgba(0,240,255,0.18)] hover:shadow-[0_0_24px_rgba(0,240,255,0.35)]',
    },
    video: {
      base: 'border-[rgba(165,94,234,0.36)] bg-[rgba(165,94,234,0.12)] text-[#c084fc]',
      hover: 'hover:border-[rgba(165,94,234,0.65)] hover:bg-[rgba(165,94,234,0.22)] hover:shadow-[0_0_24px_rgba(165,94,234,0.40)]',
    },
    end: {
      base: 'border-rose-400/40 bg-rose-500/85 text-white shadow-[0_0_20px_rgba(244,63,94,0.40)]',
      hover: 'hover:bg-rose-500 hover:shadow-[0_0_28px_rgba(244,63,94,0.65)]',
    },
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={[
        'group relative inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur',
        'transition-all duration-150 ease-out active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cosmic-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,12,26,0.82)]',
        palette.base,
        disabled
          ? 'cursor-not-allowed opacity-40 saturate-50'
          : palette.hover,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function BackArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
    </svg>
  );
}

function PhoneEndIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 8.63 19.4M5 12.55a11 11 0 0 1 7-2.55 11 11 0 0 1 7 2.55M2 8.82a16 16 0 0 1 20 0M3 3l18 18" />
    </svg>
  );
}
