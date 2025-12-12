/**
 * Attachment Input Component
 * 
 * Provides file selection and preview for sending attachments
 * with Time Lock and Burn After Reading support
 */

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

  // Generate thumbnail preview for images
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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        aria-label={t('attachments.select_file')}
      />

      {/* Attachment button */}
      {!selectedFile && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="
            text-quantum-cyan hover:text-quantum-cyan/80
            transition-colors p-2 rounded-lg
            hover:bg-quantum-cyan/10
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          aria-label={t('attachments.attach_file')}
          title={t('attachments.attach_file')}
        >
          📎
        </button>
      )}

      {/* File preview */}
      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="
              flex items-center gap-3 p-3 
              bg-dark-matter-lighter border border-quantum-cyan/30 
              rounded-lg
            "
          >
            {/* Thumbnail or icon */}
            <div className="flex-shrink-0">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={selectedFile.name}
                  className="w-12 h-12 object-cover rounded"
                />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center text-2xl bg-dark-matter rounded">
                  {getFileIcon(selectedFile.type)}
                </div>
              )}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-pure-white font-medium truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-grey">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>

            {/* Remove button */}
            <button
              onClick={handleClear}
              className="
                flex-shrink-0 text-error-glow hover:text-error-glow/80
                transition-colors p-2 rounded-lg
                hover:bg-error-glow/10
              "
              aria-label={t('attachments.remove')}
              title={t('attachments.remove')}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
