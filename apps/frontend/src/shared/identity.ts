/**
 * Identity & Safety Numbers Module
 * 
 * SECURITY FIX: Implements Signal-style Safety Numbers for out-of-band
 * public key verification to prevent MITM attacks.
 * 
 * Safety Numbers allow users to verify that they are communicating with
 * the intended person and not an attacker who substituted their public keys.
 */

/**
 * Generates a Safety Number (fingerprint) from a public key
 * 
 * Format: 5 blocks of 6 digits (30 digits total)
 * Example: "123456 789012 345678 901234 567890"
 * 
 * @param publicKey - Base64-encoded public key
 * @returns Safety Number string (30 digits in 5 blocks)
 */
export async function generateSafetyNumber(publicKey: string): Promise<string> {
  // Convert public key to bytes
  const keyBytes = base64ToBytes(publicKey);
  
  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert hash to big integer representation
  let bigNum = BigInt(0);
  for (let i = 0; i < hashArray.length; i++) {
    bigNum = (bigNum << BigInt(8)) | BigInt(hashArray[i]);
  }
  
  // Convert to decimal string and take first 30 digits
  let numString = bigNum.toString(10);
  
  // Ensure we have at least 30 digits (pad with leading zeros if needed)
  numString = numString.padStart(30, '0');
  
  // Take only first 30 digits
  numString = numString.substring(0, 30);
  
  // Format as 5 blocks of 6 digits
  const blocks: string[] = [];
  for (let i = 0; i < 30; i += 6) {
    blocks.push(numString.substring(i, i + 6));
  }
  
  return blocks.join(' ');
}

/**
 * Generates a combined Safety Number for two users
 * 
 * Used to verify a conversation between two parties.
 * Order-independent (same result regardless of which user generates it).
 * 
 * @param localPublicKey - Your public key (Base64)
 * @param remotePublicKey - Other party's public key (Base64)
 * @param localIdentifier - Your identifier (username or ID)
 * @param remoteIdentifier - Other party's identifier
 * @returns Combined Safety Number
 */
export async function generateCombinedSafetyNumber(
  localPublicKey: string,
  remotePublicKey: string,
  localIdentifier: string,
  remoteIdentifier: string
): Promise<string> {
  // Sort to ensure order-independence
  const sorted = [
    { key: localPublicKey, id: localIdentifier },
    { key: remotePublicKey, id: remoteIdentifier },
  ].sort((a, b) => a.id.localeCompare(b.id));
  
  // Concatenate sorted keys and identifiers
  const combined = `${sorted[0].key}:${sorted[0].id}:${sorted[1].key}:${sorted[1].id}`;
  const combinedBytes = new TextEncoder().encode(combined);
  
  // Hash the combined data
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBytes);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert to Safety Number (same algorithm as single key)
  let bigNum = BigInt(0);
  for (let i = 0; i < hashArray.length; i++) {
    bigNum = (bigNum << BigInt(8)) | BigInt(hashArray[i]);
  }
  
  let numString = bigNum.toString(10).padStart(30, '0').substring(0, 30);
  
  const blocks: string[] = [];
  for (let i = 0; i < 30; i += 6) {
    blocks.push(numString.substring(i, i + 6));
  }
  
  return blocks.join(' ');
}

/**
 * Generates a short fingerprint for display in UI
 * 
 * @param publicKey - Base64-encoded public key
 * @returns Short fingerprint (12 characters, hex)
 */
export async function generateShortFingerprint(publicKey: string): Promise<string> {
  const keyBytes = base64ToBytes(publicKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Take first 6 bytes and convert to hex
  return Array.from(hashArray.slice(0, 6))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a QR code-friendly data string for key verification
 * 
 * Format: VERSION:PUBLIC_KEY:IDENTIFIER:TIMESTAMP
 * 
 * @param publicKey - Base64-encoded public key
 * @param identifier - User identifier (username)
 * @returns QR code data string
 */
export function generateQRCodeData(publicKey: string, identifier: string): string {
  const version = 'v1';
  const timestamp = Date.now();
  
  return `${version}:${publicKey}:${identifier}:${timestamp}`;
}

/**
 * Parses QR code data string
 * 
 * @param qrData - Scanned QR code data
 * @returns Parsed data or null if invalid
 */
export function parseQRCodeData(qrData: string): {
  version: string;
  publicKey: string;
  identifier: string;
  timestamp: number;
} | null {
  try {
    const parts = qrData.split(':');
    
    if (parts.length !== 4) {
      return null;
    }
    
    const [version, publicKey, identifier, timestampStr] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    if (isNaN(timestamp)) {
      return null;
    }
    
    // Validate version
    if (version !== 'v1') {
      console.warn(`[Identity] Unknown QR code version: ${version}`);
    }
    
    return {
      version,
      publicKey,
      identifier,
      timestamp,
    };
  } catch (error) {
    console.error('[Identity] Failed to parse QR code data:', error);
    return null;
  }
}

/**
 * Verifies that two public keys match
 * 
 * @param key1 - First public key (Base64)
 * @param key2 - Second public key (Base64)
 * @returns true if keys match
 */
export function verifyPublicKeyMatch(key1: string, key2: string): boolean {
  // Normalize by removing whitespace and case differences
  const normalized1 = key1.replace(/\s/g, '').toLowerCase();
  const normalized2 = key2.replace(/\s/g, '').toLowerCase();
  
  return normalized1 === normalized2;
}

/**
 * Formats a Safety Number for display with enhanced readability
 * 
 * @param safetyNumber - Safety Number string
 * @returns HTML-formatted Safety Number
 */
export function formatSafetyNumberForDisplay(safetyNumber: string): string {
  const blocks = safetyNumber.split(' ');
  
  // Add visual spacing for better readability
  return blocks.map((block, index) => {
    // Add separator after every 2 blocks
    const separator = (index + 1) % 2 === 0 && index < blocks.length - 1 ? '\n' : ' ';
    return block + separator;
  }).join('').trim();
}

/**
 * Utility: Base64 to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Validates that a Safety Number has the correct format
 * 
 * @param safetyNumber - Safety Number to validate
 * @returns true if valid format
 */
export function validateSafetyNumberFormat(safetyNumber: string): boolean {
  // Should be 5 blocks of 6 digits separated by spaces
  const pattern = /^\d{6} \d{6} \d{6} \d{6} \d{6}$/;
  return pattern.test(safetyNumber);
}

/**
 * Compares two Safety Numbers for equality
 * 
 * @param sn1 - First Safety Number
 * @param sn2 - Second Safety Number
 * @returns true if Safety Numbers match
 */
export function compareSafetyNumbers(sn1: string, sn2: string): boolean {
  // Remove all whitespace for comparison
  const clean1 = sn1.replace(/\s/g, '');
  const clean2 = sn2.replace(/\s/g, '');
  
  return clean1 === clean2;
}

/**
 * Generates a verification code for voice/manual verification
 * 
 * Shorter version of Safety Number for reading over phone/voice call.
 * 
 * @param publicKey - Base64-encoded public key
 * @returns 6-digit verification code
 */
export async function generateVoiceVerificationCode(publicKey: string): Promise<string> {
  const safetyNumber = await generateSafetyNumber(publicKey);
  
  // Take first 6 digits (first block)
  return safetyNumber.substring(0, 6);
}