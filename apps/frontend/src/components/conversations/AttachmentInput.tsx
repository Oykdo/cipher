import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatFileSize, getFileIcon } from '../../lib/attachment';

interface AttachmentInputProps {
  onAttachmentSelect: (file: File) => void;
  onAttachmentClear: () => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function AttachmentInput({
  onAttachmentSelect,
  onAttachmentClear,
  selectedFile,
  disabled = false,
}: AttachmentInputProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const generatePreview = useCallback(async (file: File) => {
    if (file.type.startsWith('image/')) {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          setThumbnail(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.warn('Failed to generate preview:', error);
      }
    } else {
      setThumbnail(null);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachmentSelect(file);
      generatePreview(file);
    }
  }, [onAttachmentSelect, generatePreview]);

  const handleClear = useCallback(() => {
    onAttachmentClear();
    setThumbnail(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onAttachmentClear]);

  return (
    <div className="attachment-input">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        aria-label={t('attachments.select_file')}
      />

      {!selectedFile && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[rgba(0,240,255,0.18)] text-[var(--cosmic-cyan)] transition-colors hover:bg-[rgba(0,240,255,0.10)] hover:text-[var(--cosmic-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('attachments.attach_file')}
          title={t('attachments.attach_file')}
        >
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
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.98 8.78l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
      )}

      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-3 bg-[rgba(6,12,26,0.82)] border border-[rgba(0,240,255,0.22)] rounded-lg backdrop-blur-xl"
          >
            <div className="flex-shrink-0">
              {thumbnail ? (
                <img src={thumbnail} alt={selectedFile.name} className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center text-2xl bg-[rgba(255,255,255,0.04)] rounded border border-[rgba(0,240,255,0.12)]">
                  {getFileIcon(selectedFile.type)}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-pure-white font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-grey">{formatFileSize(selectedFile.size)}</p>
            </div>

            <button
              onClick={handleClear}
              className="flex-shrink-0 text-error-glow hover:text-error-glow/80 transition-colors p-2 rounded-lg hover:bg-error-glow/10"
              aria-label={t('attachments.remove')}
              title={t('attachments.remove')}
            >
              CLEAR
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
