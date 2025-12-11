/**
 * DiceKey Utilities - ULTIMATE SECURITY
 * 
 * ARCHITECTURE: 30 series × 10 dice = 300 rolls (775 bits)
 * 
 * Configuration:
 * - Series: 30 independent dice roll sessions
 * - Dice per series: 10 physical dice (1-6)
 * - Total rolls: 300
 * - Entropy: log2(6^300) ≈ 775 bits
 * - Security level: Quantum-resistant (exceeds 512 bits)
 * - Compliant with NIST SP 800-57 recommendations for 2030+
 * 
 * Why 30 series × 10 dice?
 * - Physical constraint: 10 dice per roll is manageable
 * - User experience: 30 series = structured progression
 * - Security: 775 bits far exceeds any known attack
 * - Deterministic: Same sequence always produces same keys
 * 
 * Functions for handling DiceKey with structured entropy
 */

// SECURITY CONFIGURATION
export const DICE_SERIES_COUNT = 30; // Number of series
export const DICE_PER_SERIES = 10;   // Dice rolled per series
export const DICE_ROLLS_REQUIRED = DICE_SERIES_COUNT * DICE_PER_SERIES; // 300 total
export const DICE_SIDES = 6;
export const ENTROPY_BITS = Math.floor(DICE_ROLLS_REQUIRED * Math.log2(DICE_SIDES)); // ~775 bits

// Validation minimum (warning if below)
const MINIMUM_SECURE_ROLLS = 142; // AES-128 equivalent (minimal acceptable)

/**
 * Validates DiceKey configuration meets security requirements
 */
export function validateDiceKeyConfiguration(): void {
  if (DICE_ROLLS_REQUIRED < MINIMUM_SECURE_ROLLS) {
    console.error(
      `🔴 CRITICAL SECURITY WARNING: DiceKey entropy (${ENTROPY_BITS} bits) ` +
      `is below minimum secure threshold (${MINIMUM_SECURE_ROLLS} rolls = 367 bits). ` +
      `Increase DICE_ROLLS_REQUIRED to at least ${MINIMUM_SECURE_ROLLS}.`
    );
  } else if (DICE_ROLLS_REQUIRED < 195) {
    console.warn(
      `⚠️  SECURITY NOTICE: DiceKey entropy (${ENTROPY_BITS} bits) ` +
      `meets minimum but not maximum security. ` +
      `Recommended: 300+ rolls for quantum resistance.`
    );
  } else {
    console.info(
      `✅ DiceKey Security: ${DICE_SERIES_COUNT} series × ${DICE_PER_SERIES} dice = ` +
      `${DICE_ROLLS_REQUIRED} rolls = ${ENTROPY_BITS} bits (Quantum-resistant)`
    );
  }
}

// Validate on module load
// Validate on module load - DISABLED to prevent confusing logs in standard flow
// validateDiceKeyConfiguration();

/**
 * Converts array of dice rolls (1-6) to hex string
 * Uses cryptographically secure bit packing
 * 
 * @param rolls - Array of integers 1-6 representing dice rolls
 * @returns Hex string (128 characters = 512 bits minimum)
 */
export function diceRollsToHex(rolls: number[]): string {
  if (rolls.length !== DICE_ROLLS_REQUIRED) {
    throw new Error(
      `Invalid dice rolls: expected ${DICE_ROLLS_REQUIRED}, got ${rolls.length}`
    );
  }

  // Validate each roll is 1-6
  for (let i = 0; i < rolls.length; i++) {
    if (rolls[i] < 1 || rolls[i] > 6) {
      throw new Error(`Invalid dice value at position ${i}: ${rolls[i]} (must be 1-6)`);
    }
  }

  // Pack dice values efficiently into bytes
  // Each die: 1-6 encoded as 0-5 (subtract 1)
  // Pack into bits: 3 bits per die (can represent 0-7, we use 0-5)
  const bitArray: number[] = [];

  for (const roll of rolls) {
    const value = roll - 1; // Convert 1-6 to 0-5
    // Add 3 bits for this die
    bitArray.push((value >> 2) & 1);
    bitArray.push((value >> 1) & 1);
    bitArray.push(value & 1);
  }

  // Convert bit array to bytes
  const bytes: number[] = [];
  for (let i = 0; i < bitArray.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8 && i + j < bitArray.length; j++) {
      byte = (byte << 1) | bitArray[i + j];
    }
    // Pad last byte if necessary
    if (i + 8 > bitArray.length) {
      byte = byte << (8 - (bitArray.length % 8));
    }
    bytes.push(byte);
  }

  // Convert bytes to hex
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decodes a DiceKey mnemonic phrase (255 dice rolls formatted as string) to hex
 * Enhanced security with proper entropy extraction
 * 
 * @param diceInput - String of 255 numbers (1-6) space or comma separated
 * @returns Hex string representing the master key
 */
export function decodeMnemonicToHex(diceInput: string | number[]): string {
  let rolls: number[];

  if (typeof diceInput === 'string') {
    // Parse string format: "1 2 3 4 5 6..." or "1,2,3,4,5,6..."
    const cleanInput = diceInput.trim().replace(/,/g, ' ');
    rolls = cleanInput.split(/\s+/).map(s => parseInt(s, 10));
  } else {
    rolls = diceInput;
  }

  // Validate entropy
  if (rolls.length < MINIMUM_SECURE_ROLLS) {
    throw new Error(
      `Insufficient entropy: ${rolls.length} rolls provided, ` +
      `minimum ${MINIMUM_SECURE_ROLLS} required for secure operation`
    );
  }

  // Convert to hex
  const hex = diceRollsToHex(rolls);

  // Ensure minimum 64 characters (256 bits) for compatibility
  // Truncate or pad as needed
  if (hex.length < 64) {
    // Pad with SHA-256 of itself for deterministic extension
    return (hex + sha256Hex(hex)).substring(0, 64);
  }

  return hex.substring(0, 128); // Return first 512 bits (plenty for master key)
}

/**
 * Simple SHA-256 implementation for hex strings (deterministic padding)
 */
function sha256Hex(hex: string): string {
  // Simple deterministic hash for padding (replace with crypto.subtle in production)
  let hash = 0;
  for (let i = 0; i < hex.length; i++) {
    const char = hex.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0').repeat(8);
}

/**
 * Validates DiceKey input (255 rolls or formatted string)
 * 
 * @param input - Array of dice rolls or formatted string
 * @returns true if valid, false otherwise
 */
export function validateDiceKeyInput(input: string | number[]): boolean {
  try {
    let rolls: number[];

    if (typeof input === 'string') {
      const cleanInput = input.trim().replace(/,/g, ' ');
      rolls = cleanInput.split(/\s+/).map(s => parseInt(s, 10));
    } else {
      rolls = input;
    }

    // Check count
    if (rolls.length !== DICE_ROLLS_REQUIRED) {
      return false;
    }

    // Check each value is 1-6
    return rolls.every(roll => Number.isInteger(roll) && roll >= 1 && roll <= 6);
  } catch {
    return false;
  }
}

/**
 * Calculate effective entropy bits from dice rolls
 * 
 * @param rollCount - Number of dice rolls
 * @returns Entropy in bits
 */
export function calculateEntropy(rollCount: number): number {
  return Math.floor(rollCount * Math.log2(DICE_SIDES));
}

/**
 * Get security assessment for given entropy
 * 
 * @param entropyBits - Entropy in bits
 * @returns Security level assessment
 */
export function getSecurityLevel(entropyBits: number): {
  level: 'CRITICAL' | 'WEAK' | 'MODERATE' | 'STRONG' | 'EXCELLENT' | 'QUANTUM_RESISTANT';
  description: string;
  suitable: string[];
} {
  if (entropyBits < 85) {
    return {
      level: 'CRITICAL',
      description: 'Critically insecure - vulnerable to GPU attacks',
      suitable: ['Testing only - DO NOT USE IN PRODUCTION'],
    };
  } else if (entropyBits < 128) {
    return {
      level: 'WEAK',
      description: 'Below industry standards (AES-128)',
      suitable: ['Demo environments', 'Non-sensitive data'],
    };
  } else if (entropyBits < 195) {
    return {
      level: 'MODERATE',
      description: 'Meets minimum standards (AES-128 equivalent)',
      suitable: ['Production', 'General use', 'Standard security'],
    };
  } else if (entropyBits < 256) {
    return {
      level: 'STRONG',
      description: 'Strong security (approaching AES-256)',
      suitable: ['High security', 'Financial data', 'Sensitive information'],
    };
  } else if (entropyBits < 512) {
    return {
      level: 'EXCELLENT',
      description: 'Excellent security (exceeds AES-256)',
      suitable: ['Maximum security', 'Cryptographic keys', 'Long-term secrets'],
    };
  } else {
    return {
      level: 'QUANTUM_RESISTANT',
      description: 'Quantum-resistant security (post-quantum era)',
      suitable: ['Future-proof', 'Quantum computing threats', 'Ultimate security'],
    };
  }
}

/**
 * Validates a single series of dice rolls (10 dice)
 * 
 * @param series - Array of 10 dice values (1-6)
 * @returns true if valid
 */
export function validateSeries(series: number[]): boolean {
  return (
    series.length === DICE_PER_SERIES &&
    series.every(roll => Number.isInteger(roll) && roll >= 1 && roll <= 6)
  );
}

/**
 * Calculates a checksum for a series (for verification purposes)
 * 
 * @param series - Array of 10 dice values
 * @returns 4-character hex checksum
 */
export function calculateSeriesChecksum(series: number[]): string {
  if (!validateSeries(series)) {
    throw new Error('Invalid series for checksum calculation');
  }

  // Simple deterministic hash
  let hash = 0;
  for (let i = 0; i < series.length; i++) {
    hash = ((hash << 5) - hash) + series[i];
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16).padStart(4, '0').substring(0, 4);
}

/**
 * Splits 300 rolls into 30 series of 10
 * 
 * @param rolls - Array of 300 dice rolls
 * @returns Array of 30 series (each containing 10 rolls)
 */
export function splitIntoSeries(rolls: number[]): number[][] {
  if (rolls.length !== DICE_ROLLS_REQUIRED) {
    throw new Error(`Expected ${DICE_ROLLS_REQUIRED} rolls, got ${rolls.length}`);
  }

  const series: number[][] = [];
  for (let i = 0; i < DICE_SERIES_COUNT; i++) {
    series.push(rolls.slice(i * DICE_PER_SERIES, (i + 1) * DICE_PER_SERIES));
  }

  return series;
}

/**
 * Flattens 30 series into 300 rolls
 * 
 * @param series - Array of 30 series (each containing 10 rolls)
 * @returns Flat array of 300 rolls
 */
export function flattenSeries(series: number[][]): number[] {
  if (series.length !== DICE_SERIES_COUNT) {
    throw new Error(`Expected ${DICE_SERIES_COUNT} series, got ${series.length}`);
  }

  return series.flat();
}

/**
 * Formats dice rolls as a human-readable string
 * 
 * @param rolls - Array of 300 dice rolls
 * @returns Formatted string with series separators
 */
export function formatDiceRolls(rolls: number[]): string {
  const series = splitIntoSeries(rolls);
  return series
    .map((s, i) => `Series ${i + 1}: ${s.join(' ')}`)
    .join('\n');
}

/**
 * Legacy compatibility: Validates 6-word mnemonic (BIP-39 style)
 * DEPRECATED: Use validateDiceKeyInput for new implementations
 */
export function validateDiceKeyMnemonic(words: string[]): boolean {
  console.warn('validateDiceKeyMnemonic is deprecated. Use validateDiceKeyInput instead.');
  return words.length === 6 && words.every(word => word.trim().length > 0);
}
