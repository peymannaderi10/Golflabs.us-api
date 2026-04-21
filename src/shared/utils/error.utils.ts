const SAFE_ERROR_PATTERNS = [
  /required/i,
  /requires/i,
  /not found/i,
  /invalid/i,
  /already (exists|cancelled|ended|recorded|have)/i,
  /cannot be/i,
  /must be/i,
  /missing/i,
  /expired/i,
  /unauthorized/i,
  /forbidden/i,
  /too (many|few|long|short)/i,
  /only (draft|confirmed|reserved)/i,
  /cannot send/i,
  /no recipients/i,
  /no pricing rules/i,
  /time slot/i,
  /not (allowed|available|confirmed)/i,
  /only.*can be/i,
  /reserved for/i,
  /in advance/i,
  /conflict/i,
  /overnight/i,
  /between.*and/i,
  /booking (is|has|cannot)/i,
  /no .* found/i,
  /access denied/i,
  /not (eligible|enrolled|active)/i,
  /failed to (create|update|delete|cancel|send|process)/i,
];

export class AppError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'AppError';
  }
}

export function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) return 'An unexpected error occurred';

  const msg = error.message;
  if (SAFE_ERROR_PATTERNS.some((p) => p.test(msg))) {
    return msg;
  }

  return 'An unexpected error occurred';
}
