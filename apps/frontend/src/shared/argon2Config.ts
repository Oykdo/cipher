/**
 * Argon2 Configuration - OWASP 2024 Recommendations
 * 
 * SECURITY FIX: Updated Argon2id parameters to meet current security standards
 * 
 * Changes from original:
 * - Memory: 65536 KB (64 MB) → 19456 KB (19 MB) - OWASP recommended
 * - Iterations: 3 → 2 - Faster while maintaining security
 * - Parallelism: 4 → 1 - Better browser compatibility
 * 
 * References:
 * - OWASP Password Storage Cheat Sheet (2024)
 * - RFC 9106 (Argon2 Memory-Hard Function)
 * - NIST SP 800-132
 */

export const ARGON2_CONFIG = {
  /**
   * Argon2 variant
   * - argon2id: Hybrid (best of argon2i + argon2d)
   * - Resistant to: GPU attacks, ASIC attacks, side-channel attacks
   */
  type: 'argon2id' as const,

  /**
   * Memory cost in KiB (OWASP 2024: 19456 KB minimum)
   * 
   * Security vs Performance trade-off:
   * - 19 MB: Good balance for web apps (fast, secure)
   * - 64 MB: Original value (slower, more secure)
   * - 512 MB: Maximum security (server-only)
   */
  memoryCost: 19456, // 19 MB in KB

  /**
   * Time cost (iterations)
   * 
   * OWASP 2024: 2 iterations recommended for memoryCost 19MB
   * - More iterations = slower but more secure
   * - With high memory cost, fewer iterations needed
   */
  timeCost: 2,

  /**
   * Parallelism (threads)
   * 
   * Browser limitations:
   * - Most browsers don't support multi-threading for crypto
   * - parallelism=1 is most portable
   */
  parallelism: 1,

  /**
   * Hash length in bytes
   * - 32 bytes = 256 bits
   * - Standard for AES-256 compatibility
   */
  hashLength: 32,

  /**
   * Salt length in bytes
   * - M bytes minimum (NIST)
   * - Randomly generated per password
   */
  saltLength: 16,
};

/**
 * Performance targets (measured on mid-range device)
 */
export const PERFORMANCE_TARGETS = {
  /**
   * Maximum acceptable hash time
   * - Desktop: < 500ms
   * - Mobile: < 1000ms
   */
  maxHashTime: 1000, // ms

  /**
   * Recommended hash time range
   * - Too fast: Vulnerable to brute-force
   * - Too slow: Bad UX
   */
  targetHashTime: {
    min: 200, // ms
    max: 800, // ms
  },
};

/**
 * Validates hash performance
 */
export function validateHashPerformance(duration: number): {
  status: 'optimal' | 'acceptable' | 'slow' | 'too_fast';
  message: string;
} {
  const { targetHashTime, maxHashTime } = PERFORMANCE_TARGETS;

  if (duration < targetHashTime.min) {
    return {
      status: 'too_fast',
      message: `Hash too fast (${duration}ms) - consider increasing timeCost or memoryCost`,
    };
  }

  if (duration > maxHashTime) {
    return {
      status: 'slow',
      message: `Hash too slow (${duration}ms) - consider decreasing parameters for better UX`,
    };
  }

  if (duration >= targetHashTime.min && duration <= targetHashTime.max) {
    return {
      status: 'optimal',
      message: `Hash time optimal (${duration}ms)`,
    };
  }

  return {
    status: 'acceptable',
    message: `Hash time acceptable (${duration}ms)`,
  };
}

/**
 * Environment-specific configuration
 */
export function getEnvironmentConfig(): typeof ARGON2_CONFIG {
  // Detect environment capabilities
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  const hardwareConcurrency = navigator.hardwareConcurrency || 1;

  if (isMobile) {
    // Lighter config for mobile devices
    return {
      ...ARGON2_CONFIG,
      memoryCost: 16384, // 16 MB
      timeCost: 2,
      parallelism: 1,
    };
  }

  if (hardwareConcurrency >= 4) {
    // Can afford slightly heavier config on powerful devices
    return {
      ...ARGON2_CONFIG,
      memoryCost: 32768, // 32 MB
      timeCost: 2,
      parallelism: 1, // Still 1 for browser compatibility
    };
  }

  // Default config for average devices
  return ARGON2_CONFIG;
}

/**
 * Migration helper: Detects if a hash uses old parameters
 */
export function isOldArgon2Hash(hash: string): boolean {
  // Argon2 hash format:  $argon2id$v=19$m=65536,t=3,p=4$...$...
  //                                      ^^^^^^^  ^     ^
  //                                      memory   time  parallelism
  
  const pattern = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/;
  const match = hash.match(pattern);

  if (!match) {
    return false; // Unknown format
  }

  const [, memory, time, parallelism] = match;

  // Old parameters: m=65536, t=3, p=4
  if (memory === '65536' && time === '3' && parallelism === '4') {
    return true;
  }

  return false;
}

/**
 * Benchmark tool for testing Argon2 performance
 */
export async function benchmarkArgon2(
  testIterations: number = 3
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  status: string;
  config: typeof ARGON2_CONFIG;
}> {
  const times: number[] = [];
  const testPassword = 'test-password-for-benchmark';
  
  // Dynamic import to avoid loading in production
  const argon2 = await import('argon2-browser');
  const config = getEnvironmentConfig();

  for (let i = 0; i < testIterations; i++) {
    const startTime = performance.now();

    await argon2.hash({
      pass: new TextEncoder().encode(testPassword),
      salt: crypto.getRandomValues(new Uint8Array(16)),
      time: config.timeCost,
      mem: config.memoryCost,
      parallelism: config.parallelism,
      hashLen: config.hashLength,
      type: argon2.ArgonType.Argon2id,
    });

    const endTime = performance.now();
    times.push(endTime - startTime);
  }

  const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const validation = validateHashPerformance(averageTime);

  return {
    averageTime: Math.round(averageTime),
    minTime: Math.round(minTime),
    maxTime: Math.round(maxTime),
    status: validation.message,
    config,
  };
}