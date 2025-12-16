import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageV2 } from '../../services/api-v2';
import { BurnAnimation } from '../BurnAnimation';
import { BurnCountdown } from '../BurnCountdown';
import { TimeLockCountdown } from '../TimeLockCountdown';
import { BurnMessage } from '../BurnMessage';
import { AttachmentMessage } from './AttachmentMessage';
import type { EncryptedAttachment } from '../../lib/attachment';
interface MessageListProps {
  messages: MessageV2[];
  sessionUserId: string;
  loadingMessages: boolean;
  isMessageLocked: (message: MessageV2) => boolean;
  burningMessages: Set<string>;
  setBurningMessages: (updater: (prev: Set<string>) => Set<string>) => void;
  acknowledgeMessage: (messageId: string) => void;
  onBurnReveal?: (messageId: string) => void;
  onBurnComplete?: (messageId: string) => void;
  onMessageUnlock?: (messageId: string) => void;
  typingUsers: string[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  formatTime: (timestamp: number) => string;
}

export function MessageList({
  messages,
  sessionUserId,
  loadingMessages,
  isMessageLocked,
  burningMessages,
  setBurningMessages,
  acknowledgeMessage,
  onBurnReveal,
  onBurnComplete,
  onMessageUnlock,
  typingUsers,
  messagesEndRef,
  formatTime,
}: MessageListProps) {
  const { t } = useTranslation();
  
  // Handle burn message reveal - forward to parent for countdown start
  const handleBurnReveal = useCallback((messageId: string) => {
    onBurnReveal?.(messageId);
  }, [onBurnReveal]);

  // Handle burn complete - forward to parent for server notification
  const handleBurnComplete = useCallback((messageId: string) => {
    onBurnComplete?.(messageId);
  }, [onBurnComplete]);

  if (loadingMessages) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-center text-soft-grey">{t('messages.loading_messages')}</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-center text-soft-grey">
          {t('messages.no_messages')}<br />
          <span className="text-xs">{t('messages.send_first_message')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <AnimatePresence>
        {messages
          .filter(message => !message.isBurned) // ✅ FIX: Don't display burned messages
          .map((message) => {
          const isOwn = message.senderId === sessionUserId;
          const locked = isMessageLocked(message);
          const burned = message.isBurned;
          // A message is a burn message if it has scheduledBurnAt OR burnDelay
          const isBurnMessage = (message.scheduledBurnAt || message.burnDelay) && !locked;
          const isBurning = burningMessages.has(message.id);
          
          // Check if message is an attachment
          let attachmentData: EncryptedAttachment | null = null;
          try {
            const parsed = JSON.parse(message.body);
            if (parsed.type === 'attachment' && parsed.payload) {
              attachmentData = parsed as EncryptedAttachment;
            }
          } catch {
            // Not an attachment, continue as text message
          }

          // Handle attachment messages
          if (attachmentData && !burned) {
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <AttachmentMessage
                  messageId={message.id}
                  conversationId={message.conversationId}
                  burnDelay={message.burnDelay}
                  attachment={attachmentData}
                  isOwn={isOwn}
                  formatTime={formatTime}
                />
              </div>
            );
          }
          
          // Use BurnMessage component for burn after reading messages (recipient only)
          // Continue rendering even if burned to show animation
          if (isBurnMessage && !isOwn && !burned && !isBurning) {
            // Get burn delay
            let originalDelay: number;
            
            if (message.burnDelay) {
              // New BAR format: burnDelay in seconds (not yet acknowledged)
              originalDelay = message.burnDelay;
              // debugLogger.debug('Using burnDelay from message:', originalDelay);
            } else if (message.scheduledBurnAt) {
              // Already acknowledged: compute remaining seconds until burn.
              // (scheduledBurnAt is based on the acknowledge time, not createdAt.)
              originalDelay = Math.ceil((message.scheduledBurnAt - Date.now()) / 1000);
              
              /*
              debugLogger.debug('Calculated delay from scheduledBurnAt:', {
                scheduledBurnAt: message.scheduledBurnAt,
                originalDelay,
              });
              */
            } else {
              console.warn('BAR message without burnDelay or scheduledBurnAt');
              return null;
            }
            
            if (isNaN(originalDelay) || originalDelay <= 0) {
              console.warn('Invalid burn delay:', originalDelay);
              return null;
            }
            
            // debugLogger.debug('Rendering BurnMessage with delay:', originalDelay);
            
            return (
              <BurnMessage
                key={message.id}
                messageId={message.id}
                content={message.body}
                isOwn={false}
                timestamp={message.createdAt}
                burnDelay={originalDelay}
                burnAt={message.scheduledBurnAt}
                isBurnedFromServer={burned}
                onReveal={() => handleBurnReveal(message.id)}
                onBurn={() => handleBurnComplete(message.id)}
                formatTime={formatTime}
              />
            );
          }

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  relative max-w-[85%] md:max-w-md p-4 rounded-2xl
                  ${isOwn
                    ? 'bg-quantum-cyan/20 border border-quantum-cyan/40'
                    : 'bg-dark-matter-lighter border border-quantum-cyan/20'
                  }
                  ${message.scheduledBurnAt && !burned ? 'ring-2 ring-orange-500/50 ring-offset-2 ring-offset-transparent' : ''}
                `}
              >
                {/* Burn Animation Overlay */}
                {burningMessages.has(message.id) && (
                  <BurnAnimation
                    onComplete={() => {
                      setBurningMessages((prev) => {
                        const next = new Set(prev);
                        next.delete(message.id);
                        return next;
                      });
                    }}
                  />
                )}

                {/* Burned Message */}
                {burned ? (
                  <div className="text-center">
                    <div className="text-4xl mb-2"></div>
                    <p className="text-sm text-muted-grey">{t('messages.message_burned')}</p>
                    {message.burnedAt && (
                      <p className="text-xs text-muted-grey mt-1">
                        {formatTime(message.burnedAt)}
                      </p>
                    )}
                  </div>
                ) : locked ? (
                  /* Locked Message - Real-time countdown */
                  <TimeLockCountdown
                    unlockTimestamp={message.unlockBlockHeight!}
                    onUnlock={() => onMessageUnlock?.(message.id)}
                  />
                ) : (
                  /* Normal Message */
                  <>
                    <p className="text-pure-white whitespace-pre-wrap break-words">
                      {message.body}
                    </p>

                    {/* Burn After Reading - Countdown for received messages (old flow, not BurnMessage) */}
                    {/* Only show if not already burning and not already burned */}
                    {message.scheduledBurnAt && !isOwn && !burningMessages.has(message.id) && !burned && (
                      <div className="mt-3 p-3 bg-error-glow/10 rounded-lg border border-error-glow/30">
                        <BurnCountdown
                          scheduledBurnAt={message.scheduledBurnAt}
                          onBurnComplete={() => {
                            setBurningMessages((prev) => new Set(prev).add(message.id));
                          }}
                        />
                        <button
                          onClick={() => acknowledgeMessage(message.id)}
                          className="mt-2 text-xs btn btn-ghost w-full hover:bg-error-glow/20"
                        >
                          {t('messages.acknowledge_read')}
                        </button>
                      </div>
                    )}

                    {/* Burn After Reading - Simple indicator for sent messages (no timer) */}
                    {(message.scheduledBurnAt || message.burnDelay) && isOwn && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 p-2 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-orange-500/10 rounded-lg border border-orange-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm animate-pulse">🔥</span>
                          <span className="text-xs font-medium text-orange-400">
                            {t('messages.burn_mode_active')}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-orange-400/70">
                          {message.burnDelay 
                            ? t('messages.burn_waiting_read')
                            : t('messages.burn_countdown_active')
                          }
                        </div>
                      </motion.div>
                    )}

                    {/* Message metadata (encryption type, P2P, timestamp) */}
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-grey">
                      <div className="flex items-center gap-2">
                        {/* Encryption type indicator */}
                        {message.encryptionType && (
                          <span 
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                              message.encryptionType === 'double-ratchet-v1'
                                ? 'bg-purple-500/20 text-purple-400'
                                : message.encryptionType === 'nacl-box-v1'
                                ? 'bg-quantum-cyan/20 text-quantum-cyan'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                            title={
                              message.encryptionType === 'double-ratchet-v1'
                                ? 'Double Ratchet (PFS)'
                                : message.encryptionType === 'nacl-box-v1'
                                ? 'NaCl Box E2EE'
                                : message.encryptionType
                            }
                          >
                            {message.encryptionType === 'double-ratchet-v1' ? '🔐' : '🔒'}
                          </span>
                        )}
                        
                        {/* P2P indicator */}
                        {message.isP2P && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                            📡 P2P
                          </span>
                        )}
                      </div>
                      
                      {/* Timestamp */}
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-xs text-soft-grey italic px-2"
        >
          {typingUsers.length > 1
            ? t('messages.users_typing_plural', { users: typingUsers.join(', ') })
            : t('messages.users_typing', { users: typingUsers[0] })
          }
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
