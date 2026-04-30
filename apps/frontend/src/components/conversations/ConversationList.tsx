import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ConversationSummaryV3 } from '../../services/api-v2';
import {
  getConversationTitle,
  getDirectPeer,
  isGroupConversation,
  getMemberCount,
} from '../../lib/conversations/helpers';
import { AtomLoader } from '../ui';

interface ConversationListProps {
  loading: boolean;
  conversations: ConversationSummaryV3[];
  selectedConversationId: string | null;
  onlineUsers: Set<string>;
  currentUserId: string;
  /** Map of conversationId → decrypted group title (when available). */
  decryptedTitles?: Map<string, string>;
  onSelectConversation: (conversationId: string) => void;
  onOpenNewConversation: () => void;
  onOpenNewGroup: () => void;
  formatTime: (timestamp: number) => string;
}

export function ConversationList({
  loading,
  conversations,
  selectedConversationId,
  onlineUsers,
  currentUserId,
  decryptedTitles,
  onSelectConversation,
  onOpenNewConversation,
  onOpenNewGroup,
  formatTime,
}: ConversationListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full bg-dark-matter-lighter">
      {/* List Header — direct + group entry points */}
      <div className="p-4 border-b border-quantum-cyan/20 flex flex-col gap-2">
        <button
          onClick={onOpenNewConversation}
          className="btn btn-primary w-full"
        >
          {t('conversations.new_conversation_button')}
        </button>
        <button
          onClick={onOpenNewGroup}
          className="btn btn-ghost w-full border border-quantum-cyan/40 text-quantum-cyan hover:bg-quantum-cyan/10"
        >
          <span className="mr-2">👥</span>
          {t('conversations.group.create_button', { defaultValue: 'Create group' })}
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <AtomLoader size="lg" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-soft-grey">
            {t('conversations.no_conversations')}<br />
            <span className="text-xs">{t('conversations.click_new_to_start')}</span>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conv) => {
              const isGroup = isGroupConversation(conv);
              const decryptedTitle = decryptedTitles?.get(conv.id) ?? null;
              const title = getConversationTitle(conv, currentUserId, decryptedTitle, t);

              // Direct: online dot for the peer.
              // Group: member-count chip (no per-group online aggregation in MVP).
              const peer = !isGroup ? getDirectPeer(conv, currentUserId) : null;
              const peerOnline = peer ? onlineUsers.has(peer.id) : false;

              return (
                <motion.button
                  key={conv.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`
                        w-full text-left p-4 rounded-lg transition-colors
                        ${selectedConversationId === conv.id
                      ? 'bg-quantum-cyan/20 border border-quantum-cyan'
                      : 'hover:bg-quantum-cyan/10'
                    }
                      `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-pure-white flex items-center gap-2 truncate">
                      <span className="truncate">{title}</span>
                      {isGroup ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-quantum-cyan/40 bg-quantum-cyan/10 text-quantum-cyan shrink-0"
                          title={t('conversations.group.n_members', {
                            count: getMemberCount(conv),
                            defaultValue: `${getMemberCount(conv)} members`,
                          })}
                        >
                          {getMemberCount(conv)}
                        </span>
                      ) : (
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${peerOnline
                            ? 'bg-green-400 animate-pulse'
                            : 'bg-gray-500'
                            }`}
                          title={peerOnline ? t('common.online') : t('common.offline')}
                        />
                      )}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-muted-grey">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  {conv.lastMessagePreview && (
                    <p className="text-sm text-soft-grey truncate">
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
