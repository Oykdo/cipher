import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BurnDelaySelector } from '../BurnDelaySelector';
import { AttachmentInput } from './AttachmentInput';

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
  selectedFile: File | null;
  onAttachmentSelect: (file: File) => void;
  onAttachmentClear: () => void;
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
  selectedFile,
  onAttachmentSelect,
  onAttachmentClear,
}: MessageInputProps) {
  const { t } = useTranslation();

  return (
    <div className="p-4 border-t border-quantum-cyan/20 bg-dark-matter-lighter">
      {/* Options (kept scrollable so it fits in short frames) */}
      <div
        className="mb-3 overflow-y-auto pr-1"
        style={{ maxHeight: 'min(14rem, 35vh)' }}
      >
        <div className="flex flex-wrap gap-2">
          {/* Burn After Reading */}
          <button
            onClick={() => {
              // Mutual exclusion: avoid stacking large panels in small frames.
              if (!burnAfterReading) {
                setTimeLockEnabled(false);
                setTimeLockDate('');
                setTimeLockTime('');
              }
              setBurnAfterReading(!burnAfterReading);
            }}
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
            onClick={() => {
              // Mutual exclusion: avoid stacking large panels in small frames.
              if (!timeLockEnabled) {
                setBurnAfterReading(false);
              }
              setTimeLockEnabled(!timeLockEnabled);
            }}
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

        {/* Attachment preview goes INSIDE the scroll area so it doesn't push input out of the viewport */}
        {selectedFile && (
          <div className="mt-2">
            <AttachmentInput
              onAttachmentSelect={onAttachmentSelect}
              onAttachmentClear={onAttachmentClear}
              selectedFile={selectedFile}
              disabled={sendingMessage}
              compact
            />
          </div>
        )}

        {/* Burn After Reading Options */}
        {burnAfterReading && (
          <div className="mt-2">
            <BurnDelaySelector value={burnDelay} onChange={setBurnDelay} />
          </div>
        )}

        {/* Time-Lock Options */}
        {timeLockEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 p-3 bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/30"
          >
            <p className="text-xs text-quantum-cyan mb-2 font-semibold">
              🔒 {t('messages.scheduled_unlock')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="date"
                value={timeLockDate}
                onChange={(e) => setTimeLockDate(e.target.value)}
                className="input text-sm"
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="time"
                value={timeLockTime}
                onChange={(e) => setTimeLockTime(e.target.value)}
                className="input text-sm"
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        {/* Attachment button (if no file selected) */}
        {!selectedFile && (
          <AttachmentInput
            onAttachmentSelect={onAttachmentSelect}
            onAttachmentClear={onAttachmentClear}
            selectedFile={null}
            disabled={sendingMessage}
            compact
          />
        )}
        
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
          disabled={(!messageBody.trim() && !selectedFile) || sendingMessage}
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
