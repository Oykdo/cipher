import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BurnDelaySelector } from '../BurnDelaySelector';
import { AttachmentInput } from './AttachmentInput';
import { EmojiPicker } from './EmojiPicker';

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

type OpenMenu = 'burn' | 'time' | null;

function formatBurnDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}j`;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const appendEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? messageBody.length;
    const selectionEnd = textarea?.selectionEnd ?? messageBody.length;
    const before = messageBody.slice(0, selectionStart);
    const after = messageBody.slice(selectionEnd);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const nextValue = `${before}${needsLeadingSpace ? ' ' : ''}${emoji}${after}`;

    onChangeMessageBody(nextValue);
    setTyping(true);

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const caret = before.length + (needsLeadingSpace ? 1 : 0) + emoji.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(caret, caret);
    });
  };

  const burnActive = burnAfterReading;
  const timeActive = timeLockEnabled;

  return (
    <div className="relative p-3 border-t border-[rgba(0,240,255,0.12)] bg-[rgba(6,12,26,0.82)] backdrop-blur-xl">
      {/* Pills row: polished icon triggers */}
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setOpenMenu(openMenu === 'burn' ? null : 'burn')}
          className={`group inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 ${
            burnActive
              ? 'bg-gradient-to-br from-[rgba(255,90,90,0.18)] to-[rgba(255,140,60,0.08)] border-[rgba(255,90,90,0.55)] text-[#ff8a6a] shadow-[0_0_14px_rgba(255,90,90,0.25)]'
              : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] text-muted-grey hover:border-[rgba(255,90,90,0.45)] hover:text-[#ff8a6a] hover:bg-[rgba(255,90,90,0.06)]'
          }`}
          title={burnActive ? `Burn après lecture — ${formatBurnDelay(burnDelay)}` : t('messages.burn_after_reading')}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            className={burnActive ? 'animate-pulse' : 'opacity-70 group-hover:opacity-100'}
          >
            <path
              d="M12 2C10 5 7 7 7 11c0 3 2 5 5 5s5-2 5-5c0-2-1-3-2-4 0 2-1 3-2 3 0-2-1-5-1-8z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M8 15c0 3 2 5 4 5s4-2 4-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{burnActive ? `Burn · ${formatBurnDelay(burnDelay)}` : 'Burn'}</span>
          <span className="opacity-50 text-[10px] leading-none">▾</span>
        </button>

        <button
          onClick={() => setOpenMenu(openMenu === 'time' ? null : 'time')}
          className={`group inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 ${
            timeActive
              ? 'bg-gradient-to-br from-[rgba(0,240,255,0.18)] to-[rgba(120,80,255,0.08)] border-[rgba(0,240,255,0.55)] text-[var(--cosmic-cyan)] shadow-[0_0_14px_rgba(0,240,255,0.22)]'
              : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] text-muted-grey hover:border-[rgba(0,240,255,0.45)] hover:text-[var(--cosmic-cyan)] hover:bg-[rgba(0,240,255,0.05)]'
          }`}
          title={timeActive ? t('messages.time_lock_enabled') : t('messages.time_lock')}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            className={timeActive ? '' : 'opacity-70 group-hover:opacity-100'}
          >
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M8 10V7a4 4 0 0 1 8 0v3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="15" r="1.3" fill="currentColor" />
          </svg>
          <span>{timeActive ? 'Lock actif' : 'Time-Lock'}</span>
          <span className="opacity-50 text-[10px] leading-none">▾</span>
        </button>
      </div>

      {/* Absolute popover above the composer */}
      <AnimatePresence>
        {openMenu && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-3 right-3 bottom-full mb-2 z-20 rounded-lg bg-[rgba(10,18,36,0.96)] border border-[rgba(0,240,255,0.18)] shadow-2xl p-3 backdrop-blur-xl"
          >
            {openMenu === 'burn' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-error-glow">BURN — après lecture</span>
                  <label className="text-xs text-muted-grey flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={burnAfterReading}
                      onChange={(e) => setBurnAfterReading(e.target.checked)}
                      className="accent-error-glow"
                    />
                    Activé
                  </label>
                </div>
                <BurnDelaySelector value={burnDelay} onChange={setBurnDelay} showDescription={false} />
              </div>
            )}

            {openMenu === 'time' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--cosmic-cyan)]">
                    LOCK — {t('messages.scheduled_unlock')}
                  </span>
                  <label className="text-xs text-muted-grey flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timeLockEnabled}
                      onChange={(e) => setTimeLockEnabled(e.target.checked)}
                      className="accent-[var(--cosmic-cyan)]"
                    />
                    Activé
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={timeLockDate}
                    onChange={(e) => setTimeLockDate(e.target.value)}
                    className="cosmic-input cosmic-input-plain flex-1 text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <input
                    type="time"
                    value={timeLockTime}
                    onChange={(e) => setTimeLockTime(e.target.value)}
                    className="cosmic-input cosmic-input-plain flex-1 text-sm"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {selectedFile && (
        <div className="mb-2">
          <AttachmentInput
            onAttachmentSelect={onAttachmentSelect}
            onAttachmentClear={onAttachmentClear}
            selectedFile={selectedFile}
            disabled={sendingMessage}
          />
        </div>
      )}

      {/* Composer row: textarea dominates, SEND fixed width */}
      <div className="flex gap-2 items-end">
        {!selectedFile && (
          <div className="shrink-0">
            <AttachmentInput
              onAttachmentSelect={onAttachmentSelect}
              onAttachmentClear={onAttachmentClear}
              selectedFile={null}
              disabled={sendingMessage}
            />
          </div>
        )}

        <div className="shrink-0">
          <EmojiPicker onSelectEmoji={appendEmoji} disabled={sendingMessage} />
        </div>

        <textarea
          ref={textareaRef}
          value={messageBody}
          onChange={(e) => {
            onChangeMessageBody(e.target.value);
            if (e.target.value.length > 0) setTyping(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t('messages.type_message_placeholder')}
          className="cosmic-input cosmic-input-plain flex-1 min-w-0 resize-none min-h-[44px] max-h-40 py-2"
          rows={2}
          disabled={sendingMessage}
        />

        <button
          onClick={onSend}
          disabled={(!messageBody.trim() && !selectedFile) || sendingMessage}
          className="cosmic-cta shrink-0 self-end"
          style={{ width: '96px', padding: '0 1rem', height: '44px', fontSize: '0.85rem' }}
        >
          {sendingMessage ? 'WAIT' : 'SEND'}
        </button>
      </div>

      <p className="text-[11px] text-muted-grey mt-1.5 opacity-70">{t('messages.input_hint')}</p>
    </div>
  );
}
