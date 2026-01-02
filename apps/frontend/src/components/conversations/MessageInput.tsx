import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BurnDelaySelector } from '../BurnDelaySelector';
import { AttachmentInput } from './AttachmentInput';
import { GasPreview } from './GasPreview';
import { calculateMessageGas, type MessagePayload } from '../../services/PrivacyGasEngine';

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
  /** Optional keystroke callback (used by Resonance cognitive checks). */
  onKeystroke?: () => void;
  /** Current user Rho for gas discount calculation. */
  userRho?: number;
  /** Currently available liquid Aether for gas payment. */
  availableAether?: number;
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
  onKeystroke,
  userRho = 0,
  availableAether = 0,
}: MessageInputProps) {
  const { t } = useTranslation();

  // Calculate estimated Privacy Gas cost
  const gasCost = useMemo(() => {
    // Construct hypothetical payload
    const payload: MessagePayload = {
      type: 'standard',
    };

    if (burnAfterReading) {
      payload.type = 'burn_after_reading';
    } else if (timeLockEnabled) {
      payload.type = 'timelock';

      // Calculate generic duration if dates are valid, else default to 1h for estimate
      // In a real app we'd parse exact dates here, but for preview 24h is fine if empty
      // or we can try to parse. 
      // Let's keep it simple: if enabled, assume at least 1 hour or the set date.
      if (timeLockDate && timeLockTime) {
        const target = new Date(`${timeLockDate}T${timeLockTime}`);
        if (!isNaN(target.getTime())) {
          const durationSec = Math.max(0, (target.getTime() - Date.now()) / 1000);
          payload.lockDuration = durationSec;
        }
      } else {
        payload.lockDuration = 3600; // 1h default estimate
      }
    } else if (selectedFile) {
      payload.type = 'attachment';
    }

    if (selectedFile) {
      payload.contentSize = selectedFile.size;
    }

    return calculateMessageGas(payload, userRho);
  }, [messageBody, selectedFile, burnAfterReading, timeLockEnabled, timeLockDate, timeLockTime, userRho]);

  const canAfford = availableAether >= gasCost;

  return (
    <div className="p-4 border-t border-quantum-cyan/20 bg-dark-matter-lighter">
      <GasPreview cost={gasCost} available={availableAether} isFree={false} />

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
              min={new Date().toISOString().split('T')[0]} // Quick fix for "today"
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

      {/* Attachment Preview (if file selected) */}
      {selectedFile && (
        <div className="mb-3">
          <AttachmentInput
            onAttachmentSelect={onAttachmentSelect}
            onAttachmentClear={onAttachmentClear}
            selectedFile={selectedFile}
            disabled={sendingMessage}
          />
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        {/* Attachment button (if no file selected) */}
        {!selectedFile && (
          <AttachmentInput
            onAttachmentSelect={onAttachmentSelect}
            onAttachmentClear={onAttachmentClear}
            selectedFile={null}
            disabled={sendingMessage}
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
            const key = e.key;
            const isMeaningfulKey =
              key.length === 1 || key === 'Backspace' || key === 'Delete' || key === 'Enter';
            if (onKeystroke && isMeaningfulKey) {
              onKeystroke();
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canAfford) {
                onSend();
              }
            }
          }}
          placeholder={t('messages.type_message_placeholder')}
          className="input flex-1 resize-none"
          rows={2}
          disabled={sendingMessage}
        />
        <button
          onClick={onSend}
          disabled={(!messageBody.trim() && !selectedFile) || sendingMessage || !canAfford}
          className={`
            btn px-4 md:px-6
            ${canAfford ? 'btn-primary' : 'bg-muted-grey cursor-not-allowed opacity-50'}
          `}
          title={!canAfford ? t('messages.insufficient_funds_tooltip', 'Fonds insuffisants pour envoyer ce type de message') : ''}
        >
          {sendingMessage ? '⏳' : canAfford ? '📤' : '🚫'}
        </button>
      </div>

      <p className="text-xs text-muted-grey mt-2">
        {t('messages.input_hint')}
      </p>
    </div>
  );
}
