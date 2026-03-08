import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: any;
  employee?: any;
  employeeProfile?: any;
  isKiosk?: boolean;
}

/**
 * Validates a Supabase JWT and sets req.user. Any authenticated user passes.
 */
export const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error({ err: error }, 'User authentication error');
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Validates a Supabase JWT and verifies the user has an employee or admin role.
 * Sets req.user and req.employeeProfile on success.
 */
export const authenticateEmployee = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
      return res.status(403).json({ error: 'Employee access required' });
    }

    req.user = user;
    req.employeeProfile = profile;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Employee authentication error');
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Validates a kiosk API key sent via X-Kiosk-Key header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const authenticateKiosk = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const kioskKey = req.headers['x-kiosk-key'] as string | undefined;
  const expectedKey = process.env.KIOSK_API_KEY;

  if (!expectedKey) {
    logger.error('KIOSK_API_KEY not configured on the server');
    return res.status(500).json({ error: 'Kiosk authentication not configured' });
  }

  if (!kioskKey) {
    return res.status(401).json({ error: 'Kiosk API key required' });
  }

  const keyBuffer = Buffer.from(kioskKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Invalid kiosk API key' });
  }

  req.isKiosk = true;
  next();
};

/**
 * Accepts either a valid kiosk API key (X-Kiosk-Key) or employee JWT.
 */
export const authenticateKioskOrEmployee = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const kioskKey = req.headers['x-kiosk-key'] as string | undefined;
  if (kioskKey) {
    return authenticateKiosk(req, res, next);
  }
  return authenticateEmployee(req, res, next);
};
