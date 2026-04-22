/**
 * Narrow an unknown caught value down to a user-facing message. Lets us write
 * `catch (err) { ... }` (typed as `unknown` per TS strict) without sprinkling
 * `any` casts or duplicating the narrowing logic everywhere.
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}
