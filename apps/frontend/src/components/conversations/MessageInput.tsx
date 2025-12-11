import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BurnDelaySelector } from '../BurnDelaySelector';

interface MessageInputProps {
  messageBody: string;
  onChangeMessageBody: (value: string) => void;
  onSend: () => void;
  sendingMessage: boolean;
  burnAfterReading: boolean;
  setBurnAfterReading: (value: boolean) => void;
  burnDelay: number;
  setBurnDelay: (value: number) => void;
  timeLockEnabled: boolean;
  setTimeLockEnabled: (value: boolean) => void;
  timeLockDate: string;
  setTimeLockDate: (value: string) => void;
  timeLockTime: string;
  setTimeLockTime: (value: string) => void;
  setTyping: (isTyping: boolean) => void;
}

export function MessageInput({
  messageBody,
  onChangeMessageBody,
  onSend,
  sendingMessage,
  burnAfterReading,
  setBurnAfterReading,
  burnDelay,
  setBurnDelay,
  timeLockEnabled,
  setTimeLockEnabled,
  timeLockDate,
  setTimeLockDate,
  timeLockTime,
  setTimeLockTime,
  setTyping,
}: MessageInputProps) {
  const { t } = useTranslation();

  return (
    <div className="p-4 border-t border-quantum-cyan/20 bg-dark-matter-lighter">
      {/* Options */}
      <div className="mb-3 flex flex-wrap gap-2">
        {/* Burn After Reading */}
        <button
          onClick={() => setBurnAfterReading(!burnAfterReading)}
          className={`
            text-xs px-3 py-1 rounded-full border transition-colors
            ${burnAfterReading
              ? 'bg-error-glow/20 border-error-glow text-error-glow'
              : 'border-muted-grey text-muted-grey hover:border-error-glow hover:text-error-glow'
            }
          `}
        >
          🔥 {burnAfterReading ? t('messages.burn_delay', { delay: burnDelay }) : t('messages.burn_after_reading')}
        </button>

        {/* Time-Lock */}
        <button
          onClick={() => setTimeLockEnabled(!timeLockEnabled)}
          className={`
            text-xs px-3 py-1 rounded-full border transition-colors
            ${timeLockEnabled
              ? 'bg-quantum-cyan/20 border-quantum-cyan text-quantum-cyan'
              : 'border-muted-grey text-muted-grey hover:border-quantum-cyan hover:text-quantum-cyan'
            }
          `}
        >
          🔒 {timeLockEnabled ? t('messages.time_lock_enabled') : t('messages.time_lock')}
        </button>
      </div>

      {/* Burn After Reading Options */}
      {burnAfterReading && (
        <BurnDelaySelector value={burnDelay} onChange={setBurnDelay} />
      )}

      {/* Time-Lock Options */}
      {timeLockEnabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-3 p-3 bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/30"
        >
          <p className="text-xs text-quantum-cyan mb-2 font-semibold">
            🔒 {t('messages.scheduled_unlock')}
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={timeLockDate}
              onChange={(e) => setTimeLockDate(e.target.value)}
              className="input flex-1 text-sm"
              min={new Date().toISOString().split('T')[0]}
            />
            <input
              type="time"
              value={timeLockTime}
              onChange={(e) => setTimeLockTime(e.target.value)}
              className="input flex-1 text-sm"
            />
          </div>
        </motion.div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={messageBody}
          onChange={(e) => {
            onChangeMessageBody(e.target.value);
            if (e.target.value.length > 0) {
              setTyping(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t('messages.type_message_placeholder')}
          className="input flex-1 resize-none"
          rows={2}
          disabled={sendingMessage}
        />
        <button
          onClick={onSend}
          disabled={!messageBody.trim() || sendingMessage}
          className="btn btn-primary px-4 md:px-6"
        >
          {sendingMessage ? '⏳' : '📤'}
        </button>
      </div>

      <p className="text-xs text-muted-grey mt-2">
        {t('messages.input_hint')}
      </p>
    </div>
  );
}
