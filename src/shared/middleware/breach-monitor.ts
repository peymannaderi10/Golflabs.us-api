import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const failedAttempts = new Map<string, { count: number; firstSeen: number }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const THRESHOLD = 20; // alert after 20 failed auth attempts in the window

/**
 * Tracks failed authentication attempts per IP and logs a warning
 * when a threshold is exceeded, supporting breach detection (GDPR Art. 33).
 */
export function breachMonitor(req: Request, res: Response, next: NextFunction) {
  const originalEnd = res.end;

  res.end = function (this: Response, ...args: any[]) {
    if (res.statusCode === 401 || res.statusCode === 403) {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const entry = failedAttempts.get(ip);

      if (entry && now - entry.firstSeen < WINDOW_MS) {
        entry.count++;
        if (entry.count === THRESHOLD) {
          logger.warn(
            { ip, count: entry.count, path: req.path, method: req.method },
            'BREACH_ALERT: excessive failed auth attempts from single IP'
          );
        }
      } else {
        failedAttempts.set(ip, { count: 1, firstSeen: now });
      }
    }
    return originalEnd.apply(this, args as any);
  } as any;

  next();
}

// Periodic cleanup of stale entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failedAttempts) {
    if (now - entry.firstSeen > WINDOW_MS) {
      failedAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);
