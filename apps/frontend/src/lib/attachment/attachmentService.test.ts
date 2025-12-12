/**
 * Attachment Service Unit Tests
 * 
 * Tests encryption, decryption, and security modes for file attachments
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encryptAttachment,
  decryptAttachment,
  isAttachmentLocked,
  getTimeUntilUnlock,
  formatFileSize,
  getFileIcon,
} from './attachmentService';

describe('AttachmentService', () => {
  let testFile: File;

  beforeEach(() => {
    // Create a test file
    const content = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    testFile = new File([content], 'test.txt', { type: 'text/plain' });
  });

  describe('encryptAttachment', () => {
    it('should encrypt a file with no security mode', async () => {
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'none'
      );

      expect(encrypted).toBeDefined();
      expect(encrypted.type).toBe('attachment');
      expect(encrypted.payload.fileName).toBe('test.txt');
      expect(encrypted.payload.fileSize).toBe(10);
      expect(encrypted.payload.fileMimeType).toBe('text/plain');
      expect(encrypted.payload.securityMode).toBe('none');
      expect(encrypted.payload.encryptedChunks).toBeInstanceOf(Array);
      expect(encrypted.payload.encryptedChunks.length).toBeGreaterThan(0);
    });

    it('should encrypt a file with burnAfterReading mode', async () => {
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'burnAfterReading'
      );

      expect(encrypted.payload.securityMode).toBe('burnAfterReading');
      expect(encrypted.payload.timeLockEpoch).toBeUndefined();
    });

    it('should encrypt a file with timeLock mode', async () => {
      const futureTime = Date.now() + 60000; // 1 minute from now
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        futureTime
      );

      expect(encrypted.payload.securityMode).toBe('timeLock');
      expect(encrypted.payload.timeLockEpoch).toBe(futureTime);
    });

    it('should throw error if timeLockEpoch is missing for timeLock mode', async () => {
      await expect(
        encryptAttachment(
          testFile,
          'sender123',
          'recipient456',
          'timeLock'
        )
      ).rejects.toThrow('timeLockEpoch is required for timeLock mode');
    });

    it('should throw error for files exceeding max size', async () => {
      // Create a file larger than 100 MB
      const largeContent = new Uint8Array(101 * 1024 * 1024);
      const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' });

      await expect(
        encryptAttachment(
          largeFile,
          'sender123',
          'recipient456',
          'none'
        )
      ).rejects.toThrow('File size exceeds maximum allowed size');
    });
  });

  describe('decryptAttachment', () => {
    it('should decrypt a file encrypted with no security mode', async () => {
      // Encrypt first
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'none'
      );

      // Then decrypt
      const decrypted = await decryptAttachment(encrypted);

      expect(decrypted).toBeDefined();
      expect(decrypted.fileName).toBe('test.txt');
      expect(decrypted.fileSize).toBe(10);
      expect(decrypted.mimeType).toBe('text/plain');
      expect(decrypted.blob).toBeInstanceOf(Blob);

      // Verify content
      const content = new Uint8Array(await decrypted.blob.arrayBuffer());
      expect(content).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    });

    it('should decrypt a file encrypted with burnAfterReading mode', async () => {
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'burnAfterReading'
      );

      const decrypted = await decryptAttachment(encrypted);

      expect(decrypted).toBeDefined();
      expect(decrypted.fileName).toBe('test.txt');
    });

    it('should throw error when decrypting time-locked file before unlock time', async () => {
      const futureTime = Date.now() + 60000; // 1 minute from now
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        futureTime
      );

      await expect(
        decryptAttachment(encrypted)
      ).rejects.toThrow(/time-locked/i);
    });

    it('should decrypt time-locked file after unlock time', async () => {
      const pastTime = Date.now() - 60000; // 1 minute ago
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        pastTime
      );

      const decrypted = await decryptAttachment(encrypted);

      expect(decrypted).toBeDefined();
      expect(decrypted.fileName).toBe('test.txt');
    });
  });

  describe('isAttachmentLocked', () => {
    it('should return false for non-time-locked attachments', async () => {
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'none'
      );

      expect(isAttachmentLocked(encrypted)).toBe(false);
    });

    it('should return true for time-locked attachments before unlock time', async () => {
      const futureTime = Date.now() + 60000;
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        futureTime
      );

      expect(isAttachmentLocked(encrypted)).toBe(true);
    });

    it('should return false for time-locked attachments after unlock time', async () => {
      const pastTime = Date.now() - 60000;
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        pastTime
      );

      expect(isAttachmentLocked(encrypted)).toBe(false);
    });
  });

  describe('getTimeUntilUnlock', () => {
    it('should return 0 for non-locked attachments', async () => {
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'none'
      );

      expect(getTimeUntilUnlock(encrypted)).toBe(0);
    });

    it('should return positive seconds for locked attachments', async () => {
      const futureTime = Date.now() + 60000; // 1 minute from now
      const encrypted = await encryptAttachment(
        testFile,
        'sender123',
        'recipient456',
        'timeLock',
        futureTime
      );

      const timeRemaining = getTimeUntilUnlock(encrypted);
      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThanOrEqual(60);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(5242880)).toBe('5.0 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
    });
  });

  describe('getFileIcon', () => {
    it('should return correct icon for images', () => {
      expect(getFileIcon('image/png')).toBe('🖼️');
      expect(getFileIcon('image/jpeg')).toBe('🖼️');
    });

    it('should return correct icon for videos', () => {
      expect(getFileIcon('video/mp4')).toBe('🎥');
    });

    it('should return correct icon for audio', () => {
      expect(getFileIcon('audio/mp3')).toBe('🎵');
    });

    it('should return correct icon for PDFs', () => {
      expect(getFileIcon('application/pdf')).toBe('📄');
    });

    it('should return correct icon for archives', () => {
      expect(getFileIcon('application/zip')).toBe('📦');
    });

    it('should return correct icon for text files', () => {
      expect(getFileIcon('text/plain')).toBe('📝');
    });

    it('should return default icon for unknown types', () => {
      expect(getFileIcon('application/unknown')).toBe('📎');
    });
  });

  describe('Chunking and large files', () => {
    it('should handle files larger than chunk size', async () => {
      // Create a 1 MB file
      const largeContent = new Uint8Array(1024 * 1024);
      for (let i = 0; i < largeContent.length; i++) {
        largeContent[i] = i % 256;
      }
      const largeFile = new File([largeContent], 'large.bin', { type: 'application/octet-stream' });

      const encrypted = await encryptAttachment(
        largeFile,
        'sender123',
        'recipient456',
        'none'
      );

      expect(encrypted.payload.totalChunks).toBeGreaterThan(1);
      expect(encrypted.payload.encryptedChunks.length).toBe(encrypted.payload.totalChunks);

      // Decrypt and verify
      const decrypted = await decryptAttachment(encrypted);
      const decryptedContent = new Uint8Array(await decrypted.blob.arrayBuffer());

      expect(decryptedContent.length).toBe(largeContent.length);
      expect(decryptedContent).toEqual(largeContent);
    });
  });

  describe('Progress callbacks', () => {
    it('should call progress callback during encryption', async () => {
      const progressCallback = vi.fn();

      const largeContent = new Uint8Array(1024 * 1024);
      const largeFile = new File([largeContent], 'large.bin', { type: 'application/octet-stream' });

      await encryptAttachment(
        largeFile,
        'sender123',
        'recipient456',
        'none',
        undefined,
        progressCallback
      );

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback.mock.calls.length).toBeGreaterThan(0);
    });

    it('should call progress callback during decryption', async () => {
      const largeContent = new Uint8Array(1024 * 1024);
      const largeFile = new File([largeContent], 'large.bin', { type: 'application/octet-stream' });

      const encrypted = await encryptAttachment(
        largeFile,
        'sender123',
        'recipient456',
        'none'
      );

      const progressCallback = vi.fn();

      await decryptAttachment(encrypted, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
