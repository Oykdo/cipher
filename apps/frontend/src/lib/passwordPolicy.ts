/**
 * Password policy — local quick-unlock password.
 *
 * Scope : ce mot de passe n'est qu'un second facteur local qui scelle le
 * KeyVault de l'appareil. Il ne circule jamais sur le réseau (SRP seed via
 * le mnémonique pour l'auth serveur), et ne protège pas contre la perte
 * du mnémonique. La politique cible donc les mots de passe réellement
 * guessables (top communs, suites, répétitions), pas la complexité
 * syntaxique qui dégrade l'UX sans gagner en sécurité.
 *
 * Design :
 * - ≥ 10 caractères (pas de maximum : les passphrases sont encouragées)
 * - zxcvbn-ts score ≥ 2/4 (rejette top 10k, patterns, séquences)
 * - PBKDF2-SHA256 600k itérations (OWASP 2024) pour le hash local
 *   stocké en `pwd_<username>` — aligné sur la BEK des backups.
 */

import { zxcvbnOptions, zxcvbn } from '@zxcvbn-ts/core';
// Named imports — @zxcvbn-ts/language-* don't ship a `default` export, so a
// `import pkg from '...'` crashes at runtime under Vite with
// "does not provide an export named 'default'".
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

let zxcvbnConfigured = false;

function ensureZxcvbnConfigured(): void {
  if (zxcvbnConfigured) return;
  zxcvbnOptions.setOptions({
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    translations: zxcvbnEnPackage.translations,
  });
  zxcvbnConfigured = true;
}

export const MIN_PASSWORD_LENGTH = 10;
export const MIN_PASSWORD_SCORE = 2; // 0-4 scale : 0=risqué, 4=excellent.

export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrength {
  /** Raw zxcvbn score (0-4). Kept for callers that want fine-grained data. */
  score: 0 | 1 | 2 | 3 | 4;
  /** UI bucket derived from score (weak = 0/1, fair = 2, good = 3, strong = 4). */
  level: PasswordStrengthLevel;
  /** True once the password passes both length + score gates. */
  acceptable: boolean;
  /** Ratio 0..1 for a progress bar. */
  progress: number;
  /**
   * One short reason the password is still too weak, or null when acceptable.
   * Intentionally never translated in this layer — the caller picks the i18n
   * key based on the error code (so translations stay grouped).
   */
  issue: PasswordIssue | null;
}

export type PasswordIssue =
  | 'too_short'
  | 'too_common'
  | 'too_predictable'
  | 'too_weak';

export function evaluatePassword(password: string, userInputs: string[] = []): PasswordStrength {
  ensureZxcvbnConfigured();

  const trimmed = password ?? '';
  const lengthOk = trimmed.length >= MIN_PASSWORD_LENGTH;

  // zxcvbn-ts is happy to score empty strings; skip it to avoid wasted work.
  const raw = trimmed.length > 0 ? zxcvbn(trimmed, userInputs) : null;
  const score = (raw?.score ?? 0) as PasswordStrength['score'];

  const level: PasswordStrengthLevel =
    score >= 4 ? 'strong' : score === 3 ? 'good' : score === 2 ? 'fair' : 'weak';

  const acceptable = lengthOk && score >= MIN_PASSWORD_SCORE;

  let issue: PasswordIssue | null = null;
  if (!lengthOk) {
    issue = 'too_short';
  } else if (score <= 0) {
    issue = 'too_common';
  } else if (score === 1) {
    issue = 'too_predictable';
  } else if (score < MIN_PASSWORD_SCORE) {
    issue = 'too_weak';
  }

  // Progress bar : length factor × score factor, capped at 1. Keeps feedback
  // lively below the 10-char threshold without ever showing "strong" too early.
  const progress = Math.min(
    1,
    Math.min(1, trimmed.length / MIN_PASSWORD_LENGTH) * (0.2 + (score / 4) * 0.8)
  );

  return { score, level, acceptable, progress, issue };
}

/**
 * PBKDF2-SHA256, 600k iterations. Output is hex-encoded for storage in
 * `pwd_<username>` — matches the format QuickUnlock.tsx already verifies
 * against, and the BEK parameters from apps/frontend/src/lib/backup.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 600_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const bytes = new Uint8Array(derivedBits);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
