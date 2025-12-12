/**
 * Attachment Module Exports
 */

export {
  encryptAttachment,
  decryptAttachment,
  burnAttachment,
  sendBurnAcknowledgment,
  isAttachmentLocked,
  getTimeUntilUnlock,
  formatFileSize,
  getFileIcon,
  type SecurityMode,
  type AttachmentMetadata,
  type EncryptedAttachment,
  type AttachmentDecryptResult,
  type ProgressCallback,
} from './attachmentService';
