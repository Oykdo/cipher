import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ConversationSummaryV2 } from '../../services/api-v2';

interface ConversationListProps {
  loading: boolean;
  conversations: ConversationSummaryV2[];
  selectedConversationId: string | null;
  onlineUsers: Set<string>;
  onSelectConversation: (conversationId: string) => void;
  onOpenNewConversation: () => void;
  formatTime: (timestamp: number) => string;
}

export function ConversationList({
  loading,
  conversations,
  selectedConversationId,
  onlineUsers,
  onSelectConversation,
  onOpenNewConversation,
  formatTime,
}: ConversationListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full bg-dark-matter-lighter">
      {/* List Header */}
      <div className="p-4 border-b border-quantum-cyan/20">
        <button
          onClick={onOpenNewConversation}
          className="btn btn-primary w-full"
        >
          {t('conversations.new_conversation_button')}
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-soft-grey">
            {t('common.loading')}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-soft-grey">
            {t('conversations.no_conversations')}<br />
            <span className="text-xs">{t('conversations.click_new_to_start')}</span>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conv) => (
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                  <span className="font-semibold text-pure-white flex items-center gap-2 min-w-0">
                    {conv.otherParticipant.username}
                    {/* Online Status Indicator */}
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${onlineUsers.has(conv.otherParticipant.id)
                        ? 'bg-green-400 animate-pulse'
                        : 'bg-gray-500'
                        }`}
                      title={onlineUsers.has(conv.otherParticipant.id) ? t('common.online') : t('common.offline')}
                    />
                  </span>
                  {conv.lastMessageAt && (
                    <span className="text-xs text-muted-grey sm:text-right">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
