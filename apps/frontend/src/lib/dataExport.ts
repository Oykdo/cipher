/**
 * RGPD-Compliant Data Export/Import Module
 * 
 * Features:
 * - Complete user data export (conversations, messages, contacts, settings)
 * - Password-based encryption (AES-256-GCM)
 * - Portable JSON format
 * - Import functionality for data restoration
 * - Self-hosted instance support
 * 
 * LEGAL: RGPD Article 20 - Droit à la portabilité des données
 */

import { API_BASE_URL } from '../config';

interface ExportedData {
  version: number;
  exportedAt: string;
  application: string;
  user: {
    id: string;
    username: string;
    createdAt?: number;
  };
  conversations: Array<{
    id: string;
    createdAt: number;
    participants: Array<{ id: string; username: string }>;
    messageCount?: number;
  }>;
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    createdAt: number;
    isEncrypted?: boolean;
  }>;
  contacts: Array<{
    id: string;
    username: string;
    addedAt?: number;
  }>;
  settings: Record<string, unknown>;
  e2eeKeyBundle?: {
    identityKey: string;
    fingerprint: string;
    signedPreKey?: {
      keyId: number;
      publicKey: string;
    };
  };
}

interface EncryptedExport {
  version: number;
  format: 'cipher-pulse-export-v1';
  encrypted: true;
  iv: string;
  salt: string;
  data: string;
  checksum: string;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with password
 */
async function encryptData(data: string, password: string): Promise<EncryptedExport> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // Calculate checksum of original data
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    version: 1,
    format: 'cipher-pulse-export-v1',
    encrypted: true,
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    checksum,
  };
}

/**
 * Decrypt data with password
 */
async function decryptData(encryptedExport: EncryptedExport, password: string): Promise<string> {
  const salt = new Uint8Array(atob(encryptedExport.salt).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(encryptedExport.iv).split('').map(c => c.charCodeAt(0)));
  const encryptedData = new Uint8Array(atob(encryptedExport.data).split('').map(c => c.charCodeAt(0)));

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );

  const decoder = new TextDecoder();
  const decryptedText = decoder.decode(decrypted);

  // Verify checksum
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(decryptedText));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const calculatedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (calculatedChecksum !== encryptedExport.checksum) {
    throw new Error('Data integrity check failed - file may be corrupted');
  }

  return decryptedText;
}

/**
 * Export all user data with optional password encryption
 */
export async function exportUserData(
  token: string,
  password?: string,
  options: { includeMessages?: boolean; includeE2eeKeys?: boolean } = {}
): Promise<{ blob: Blob; filename: string }> {
  const { includeMessages = true, includeE2eeKeys = false } = options;

  // Fetch all user data from server
  const response = await fetch(`${API_BASE_URL}/api/backup/export-full`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ includeMessages, includeE2eeKeys }),
  });

  if (!response.ok) {
    // Fallback to standard export if full export not available
    const fallbackResponse = await fetch(`${API_BASE_URL}/api/backup/export`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!fallbackResponse.ok) {
      throw new Error('Failed to export data');
    }

    const fallbackData = await fallbackResponse.json();
    const decodedData = atob(fallbackData.data);
    
    if (password) {
      const encrypted = await encryptData(decodedData, password);
      const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
      return {
        blob,
        filename: `cipher-pulse-export-encrypted-${Date.now()}.json`,
      };
    }

    const blob = new Blob([decodedData], { type: 'application/json' });
    return {
      blob,
      filename: fallbackData.filename,
    };
  }

  const exportData: ExportedData = await response.json();

  // Add metadata
  exportData.version = 2;
  exportData.exportedAt = new Date().toISOString();
  exportData.application = 'Cipher Pulse';

  const jsonData = JSON.stringify(exportData, null, 2);

  if (password) {
    const encrypted = await encryptData(jsonData, password);
    const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
    return {
      blob,
      filename: `cipher-pulse-export-encrypted-${Date.now()}.json`,
    };
  }

  const blob = new Blob([jsonData], { type: 'application/json' });
  return {
    blob,
    filename: `cipher-pulse-export-${Date.now()}.json`,
  };
}

/**
 * Import user data from export file
 */
export async function importUserData(
  token: string,
  file: File,
  password?: string
): Promise<{ success: boolean; message: string; imported: { conversations: number; messages: number } }> {
  const fileContent = await file.text();
  let parsedData: ExportedData | EncryptedExport;

  try {
    parsedData = JSON.parse(fileContent);
  } catch {
    throw new Error('Invalid file format - not valid JSON');
  }

  // Check if encrypted
  if ('encrypted' in parsedData && parsedData.encrypted === true) {
    if (!password) {
      throw new Error('This export is encrypted. Please provide a password.');
    }

    try {
      const decrypted = await decryptData(parsedData as EncryptedExport, password);
      parsedData = JSON.parse(decrypted);
    } catch (error) {
      if (error instanceof Error && error.message.includes('integrity')) {
        throw error;
      }
      throw new Error('Failed to decrypt - incorrect password or corrupted file');
    }
  }

  // Validate data structure
  const data = parsedData as ExportedData;
  if (!data.version || !data.conversations || !data.messages) {
    throw new Error('Invalid export file structure');
  }

  // Send to server for import
  const response = await fetch(`${API_BASE_URL}/api/backup/import-full`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: btoa(JSON.stringify(data)),
      version: data.version,
    }),
  });

  if (!response.ok) {
    // Fallback to standard import
    const fallbackResponse = await fetch(`${API_BASE_URL}/api/backup/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: btoa(JSON.stringify(data)),
        filename: file.name,
      }),
    });

    if (!fallbackResponse.ok) {
      const error = await fallbackResponse.json();
      throw new Error(error.error || 'Import failed');
    }

    const result = await fallbackResponse.json();
    return {
      success: true,
      message: result.message || 'Import successful',
      imported: {
        conversations: data.conversations?.length || 0,
        messages: data.messages?.length || 0,
      },
    };
  }

  const result = await response.json();
  return {
    success: true,
    message: result.message || 'Import successful',
    imported: result.imported || {
      conversations: data.conversations?.length || 0,
      messages: data.messages?.length || 0,
    },
  };
}

/**
 * Validate export file without importing
 */
export async function validateExportFile(
  file: File,
  password?: string
): Promise<{ valid: boolean; encrypted: boolean; stats: { conversations: number; messages: number; contacts: number } }> {
  const fileContent = await file.text();
  let parsedData: ExportedData | EncryptedExport;

  try {
    parsedData = JSON.parse(fileContent);
  } catch {
    return { valid: false, encrypted: false, stats: { conversations: 0, messages: 0, contacts: 0 } };
  }

  const isEncrypted = 'encrypted' in parsedData && parsedData.encrypted === true;

  if (isEncrypted) {
    if (!password) {
      return { valid: true, encrypted: true, stats: { conversations: 0, messages: 0, contacts: 0 } };
    }

    try {
      const decrypted = await decryptData(parsedData as EncryptedExport, password);
      parsedData = JSON.parse(decrypted);
    } catch {
      return { valid: false, encrypted: true, stats: { conversations: 0, messages: 0, contacts: 0 } };
    }
  }

  const data = parsedData as ExportedData;
  const valid = Boolean(data.version && data.conversations && data.messages);

  return {
    valid,
    encrypted: isEncrypted,
    stats: {
      conversations: data.conversations?.length || 0,
      messages: data.messages?.length || 0,
      contacts: data.contacts?.length || 0,
    },
  };
}

/**
 * Request complete data deletion (RGPD Article 17 - Droit à l'effacement)
 */
export async function requestDataDeletion(token: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/user/delete-all-data`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Deletion request failed');
  }

  return await response.json();
}
