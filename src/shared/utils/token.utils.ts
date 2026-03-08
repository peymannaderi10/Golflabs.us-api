import crypto from 'crypto';

const UNLOCK_TOKEN_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'unlock-token-fallback-secret';

interface UnlockTokenPayload {
  bookingId: string;
  startTime: string;
  endTime: string;
  expires: number;
}

export function createUnlockToken(bookingId: string, startTime: string, endTime: string): string {
  const payload: UnlockTokenPayload = {
    bookingId,
    startTime,
    endTime,
    expires: new Date(endTime).getTime(),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', UNLOCK_TOKEN_SECRET)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

export function verifyUnlockToken(token: string): UnlockTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', UNLOCK_TOKEN_SECRET)
    .update(data)
    .digest('base64url');

  if (expectedSig.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) return null;

  try {
    const payload: UnlockTokenPayload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8')
    );

    if (!payload.bookingId || !payload.expires) return null;

    return payload;
  } catch {
    return null;
  }
}
