/**
 * Attachment Message Component
 * 
 * Displays received attachments with:
 * - Time Lock countdown
 * - Burn After Reading warning
 * - Download/Open functionality
 * - Progress indicators
 */

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  decryptAttachment,
  isAttachmentLocked,
  getTimeUntilUnlock,
  formatFileSize,
  getFileIcon,
  burnAttachment,
  type EncryptedAttachment,
} from '../../lib/attachment';

interface AttachmentMessageProps {
  attachment: EncryptedAttachment;
  isOwn: boolean;
  onBurnComplete?: (attachmentId: string) => void;
  formatTime: (timestamp: number) => string;
}

export function AttachmentMessage({
  attachment,
  isOwn,
  onBurnComplete,
  formatTime,
}: AttachmentMessageProps) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [burned, setBurned] = useState(false);
  const [timeUntilUnlock, setTimeUntilUnlock] = useState(
    getTimeUntilUnlock(attachment)
  );

  const isLocked = isAttachmentLocked(attachment);
  const isBurnMode = attachment.payload.securityMode === 'burnAfterReading';

  // Update time lock countdown
  useEffect(() => {
    if (!isLocked) return;

    const interval = setInterval(() => {
      const remaining = getTimeUntilUnlock(attachment);
      setTimeUntilUnlock(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked, attachment]);

  // Format countdown display
  const formatCountdown = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }, []);

  // Handle download/open
  const handleDownload = useCallback(async () => {
    if (isLocked || burned) return;

    try {
      setDownloading(true);
      setError(null);

      // Decrypt attachment with progress
      const result = await decryptAttachment(attachment, (progress, total) => {
        setDownloadProgress((progress / total) * 100);
      });

      // Create download link
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Handle Burn After Reading
      if (isBurnMode) {
        // Mark as burned locally
        await burnAttachment(attachment.id);
        setBurned(true);

        // Send acknowledgment to sender
        if (onBurnComplete) {
          onBurnComplete(attachment.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to download attachment:', err);
      setError(err.message || t('attachments.download_error'));
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }, [attachment, isLocked, burned, isBurnMode, onBurnComplete, t]);

  // Render burned state
  if (burned) {
    return (
      <div
        className={`
          max-w-[85%] md:max-w-md p-4 rounded-2xl
          ${isOwn
            ? 'bg-quantum-cyan/20 border border-quantum-cyan/40'
            : 'bg-dark-matter-lighter border border-quantum-cyan/20'
          }
        `}
      >
        <div className="text-center">
          <div className="text-4xl mb-2">🔥</div>
          <p className="text-sm text-muted-grey">
            {t('attachments.attachment_burned')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        max-w-[85%] md:max-w-md p-4 rounded-2xl
        ${isOwn
          ? 'bg-quantum-cyan/20 border border-quantum-cyan/40'
          : 'bg-dark-matter-lighter border border-quantum-cyan/20'
        }
        ${isBurnMode ? 'ring-2 ring-orange-500/50' : ''}
      `}
    >
      {/* Attachment header */}
      <div className="flex items-start gap-3">
        {/* Thumbnail or icon */}
        <div className="flex-shrink-0">
          {attachment.payload.thumbnail ? (
            <img
              src={attachment.payload.thumbnail}
              alt={attachment.payload.fileName}
              className="w-16 h-16 object-cover rounded"
            />
          ) : (
            <div className="w-16 h-16 flex items-center justify-center text-3xl bg-dark-matter rounded">
              {getFileIcon(attachment.payload.fileMimeType)}
            </div>
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-pure-white font-medium truncate">
            {attachment.payload.fileName}
          </p>
          <p className="text-xs text-muted-grey">
            {formatFileSize(attachment.payload.fileSize)}
          </p>
          <p className="text-xs text-muted-grey">
            {formatTime(attachment.timestamp)}
          </p>
        </div>
      </div>

      {/* Security mode indicator */}
      {attachment.payload.securityMode !== 'none' && (
        <div className="mt-3 text-xs">
          {attachment.payload.securityMode === 'timeLock' && (
            <div className="flex items-center gap-2 text-quantum-cyan">
              <span>🔒</span>
              <span>{t('attachments.time_locked')}</span>
            </div>
          )}
          {attachment.payload.securityMode === 'burnAfterReading' && (
            <div className="flex items-center gap-2 text-error-glow">
              <span>🔥</span>
              <span>{t('attachments.burn_after_reading')}</span>
            </div>
          )}
        </div>
      )}

      {/* Time lock countdown */}
      {isLocked && (
        <div className="mt-3 p-3 bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/30">
          <p className="text-xs text-quantum-cyan font-semibold mb-1">
            {t('attachments.unlocks_in')}
          </p>
          <p className="text-lg text-quantum-cyan font-mono">
            {formatCountdown(timeUntilUnlock)}
          </p>
        </div>
      )}

      {/* Download button */}
      <div className="mt-3">
        <button
          onClick={handleDownload}
          disabled={isLocked || downloading || burned}
          className={`
            w-full py-2 px-4 rounded-lg font-medium text-sm
            transition-all
            ${isLocked
              ? 'bg-muted-grey/20 text-muted-grey cursor-not-allowed'
              : 'bg-quantum-cyan/20 text-quantum-cyan hover:bg-quantum-cyan/30 border border-quantum-cyan/40'
            }
            ${downloading ? 'cursor-wait' : ''}
          `}
        >
          {downloading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              {downloadProgress > 0 && (
                <span>{Math.round(downloadProgress)}%</span>
              )}
            </span>
          ) : isLocked ? (
            t('attachments.locked')
          ) : (
            <>📥 {t('attachments.download')}</>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-2 bg-error-glow/10 border border-error-glow/30 rounded text-xs text-error-glow">
          {error}
        </div>
      )}

      {/* Burn warning */}
      {isBurnMode && !burned && !isOwn && (
        <div className="mt-3 p-2 bg-error-glow/10 border border-error-glow/30 rounded text-xs text-error-glow">
          ⚠️ {t('attachments.burn_warning')}
        </div>
      )}
    </motion.div>
  );
}
