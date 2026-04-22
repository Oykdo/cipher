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

  return (
    <div className="p-4 border-b border-[rgba(0,240,255,0.12)] bg-[rgba(6,12,26,0.82)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onBackToList} className="md:hidden cosmic-btn-ghost p-2 shrink-0">
            BACK
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

        <div
          className="shrink-0 ml-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[rgba(0,240,255,0.12)] border border-[rgba(0,240,255,0.28)]"
          title={t('encryption.e2ee_active', 'End-to-End Encryption Active')}
          style={{ color: 'var(--cosmic-cyan)' }}
        >
          E2EE
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isThisConversationCall ? (
            <button
              onClick={onEndCall}
              className="rounded-full bg-rose-500 px-3 py-2 text-xs font-semibold text-white"
              title="End encrypted call"
            >
              END
            </button>
          ) : (
            <>
              <button
                onClick={onStartAudioCall}
                disabled={!isOnline || callBusyElsewhere}
                className="rounded-full border border-[rgba(0,240,255,0.24)] bg-[rgba(0,240,255,0.10)] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: 'var(--cosmic-cyan)' }}
                title="Start encrypted audio call"
              >
                AUDIO
              </button>
              <button
                onClick={onStartVideoCall}
                disabled={!isOnline || callBusyElsewhere}
                className="rounded-full border border-[rgba(165,94,234,0.28)] bg-[rgba(165,94,234,0.12)] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: 'var(--accent-violet, #c084fc)' }}
                title="Start encrypted video call"
              >
                VIDEO
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
