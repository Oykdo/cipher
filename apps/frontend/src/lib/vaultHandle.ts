/**
 * Format a vault's user-facing handle as "Name#0001".
 *
 * Two users can pick the same human-readable name, so we always append the
 * `vault_number` (globally unique, assigned by the lock server at registration
 * time) as a discriminator. Minimum 4 digits — matches Discord's historical
 * tag convention and leaves room for up to 9999 without width drift.
 *
 * - `formatVaultHandle("Alice", 42)`        → "Alice#0042"
 * - `formatVaultHandle("", 42)`             → "#0042"
 * - `formatVaultHandle("Alice", null)`      → "Alice"
 * - `formatVaultHandle(null, null)`         → "#?"
 */
export function formatVaultHandle(
  name: string | null | undefined,
  number: number | null | undefined,
): string {
  const trimmed = (name ?? '').trim();
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return trimmed || '#?';
  }
  const tag = String(number).padStart(4, '0');
  return trimmed ? `${trimmed}#${tag}` : `#${tag}`;
}
