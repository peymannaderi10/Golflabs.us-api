import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { BusinessController } from './business.controller';
import { authenticateEmployee, AuthenticatedRequest } from '../auth/auth.middleware';

export const businessRoutes = Router();

const controller = new BusinessController();

/**
 * Key rate limits on IP + normalized email where available. The email
 * fingerprint prevents a single attacker from rotating IPs to bypass the
 * limit for one target account, while still catching IP-only floods.
 */
function ipPlusEmailKey(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? 'unknown');
  const email = typeof req.body?.email === 'string'
    ? req.body.email.toLowerCase().trim()
    : typeof req.body?.owner?.email === 'string'
      ? req.body.owner.email.toLowerCase().trim()
      : '';
  return email ? `${ip}|${email}` : ip;
}

const startSignupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusEmailKey,
  message: { success: false, error: 'Too many signup attempts, please try again later' },
});

const verifySignupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window matches OTP TTL
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusEmailKey,
  message: { success: false, error: 'Too many verification attempts, please try again later' },
});

/**
 * Per-authenticated-user limiter on location creation. Keyed on the
 * authenticated user id (set by authenticateEmployee) rather than IP so
 * coworkers behind a NAT are not collectively throttled.
 */
const createLocationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.employeeProfile?.id ?? ipKeyGenerator(req.ip ?? 'unknown');
  },
  message: { success: false, error: 'Too many location creation attempts, please try again later' },
});

businessRoutes.post('/signup/start', startSignupLimiter, controller.startSignup);
businessRoutes.post('/signup/verify', verifySignupLimiter, controller.verifySignup);
businessRoutes.post(
  '/locations',
  authenticateEmployee,
  createLocationLimiter,
  controller.createLocation
);
