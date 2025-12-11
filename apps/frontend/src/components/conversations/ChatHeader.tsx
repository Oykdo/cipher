import { useTranslation } from 'react-i18next';
import type { ConversationSummaryV2 } from '../../services/api-v2';
import { EncryptionStatusBadge } from './EncryptionStatusBadge';

export type ConnectionMode = 'p2p' | 'relayed' | 'connecting';
export type EncryptionMode = 'nacl-box' | 'double-ratchet';

interface ChatHeaderProps {
  conversation: ConversationSummaryV2;
  onlineUsers: Set<string>;
  onBackToList: () => void;
  connectionMode?: ConnectionMode;
  onEncryptionModeChange?: (mode: EncryptionMode) => void;
}

export function ChatHeader({ conversation, onlineUsers, onBackToList, connectionMode }: ChatHeaderProps) {
  const { t } = useTranslation();
  const isOnline = onlineUsers.has(conversation.otherParticipant.id);

  const getConnectionModeDisplay = () => {
    switch (connectionMode) {
      case 'p2p':
        return {
          label: 'P2P',
          className: 'bg-green-500/20 text-green-400 border-green-500/50',
          icon: '🔗',
          title: t('connection.p2p_direct', 'Direct P2P - No server relay'),
        };
      case 'relayed':
        return {
          label: t('connection.relayed', 'Relayed'),
          className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
          icon: '☁️',
          title: t('connection.relayed_server', 'Via server - E2EE maintained'),
        };
      case 'connecting':
        return {
          label: t('connection.connecting', 'Connecting...'),
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/50 animate-pulse',
          icon: '⏳',
          title: t('connection.establishing', 'Establishing P2P connection'),
        };
      default:
        return null;
    }
  };

  const modeDisplay = getConnectionModeDisplay();

  return (
    <div className="p-4 border-b border-quantum-cyan/20 bg-dark-matter-lighter">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onBackToList}
            className="md:hidden btn btn-ghost p-2 shrink-0"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-pure-white flex items-center gap-2">
              <span className="truncate">{conversation.otherParticipant.username}</span>
              {/* Online Status Indicator */}
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
                  }`}
                title={isOnline ? t('common.online') : t('common.offline')}
              />
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-soft-grey">
                {isOnline ? (
                  <span className="text-green-400">{t('common.online')}</span>
                ) : (
                  <span className="text-gray-500">{t('common.offline')}</span>
                )}
              </p>
              <EncryptionStatusBadge peerUsername={conversation.otherParticipant.username} />
              {/* P2P Connection Mode Indicator */}
              {modeDisplay && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${modeDisplay.className}`}
                  title={modeDisplay.title}
                >
                  {modeDisplay.icon} {modeDisplay.label}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Encryption Status Badge - NaCl Box is forced for reliability */}
        <div 
          className="shrink-0 ml-2 flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-quantum-cyan/20 text-quantum-cyan border border-quantum-cyan/50"
          title={t('encryption.e2ee_active', 'End-to-End Encryption Active')}
        >
          <span>🔒</span>
          <span className="hidden sm:inline">E2EE</span>
        </div>
      </div>
    </div>
  );
}
