import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../../config/database';
import { logger } from '../../shared/utils/logger';

export interface EmployeeProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  location_id: string | null;
  clientId: string;
  clientRole: 'owner' | 'admin' | 'employee';
  accessibleLocationIds: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: any;
  employeeProfile?: EmployeeProfile;
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
      .select('id, email, full_name, role, location_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    // INVARIANT: user_profiles.role is one of 'customer' | 'employee' | 'admin'.
    // Business owners have user_profiles.role='admin' and client_members.role='owner'
    // — ownership-level authorization reads from employeeProfile.clientRole (below),
    // not user_profiles.role. Never migrate user_profiles.role to include 'owner'
    // without updating this gate.
    if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
      return res.status(403).json({ error: 'Employee access required' });
    }

    // Query client_members for multi-location access
    const { data: memberships } = await supabase
      .from('client_members')
      .select('client_id, role, location_id')
      .eq('user_id', user.id);

    let clientId = '';
    let clientRole: 'owner' | 'admin' | 'employee' = 'employee';
    let accessibleLocationIds: string[] = [];

    if (memberships && memberships.length > 0) {
      const uniqueClients = new Set(memberships.map(m => m.client_id));
      if (uniqueClients.size > 1) {
        logger.error({ userId: user.id }, 'Employee has memberships across multiple clients');
        return res.status(403).json({ error: 'Account configuration error — contact support' });
      }
      clientId = memberships[0].client_id;
      // Derive highest role across all memberships
      const roles = memberships.map(m => m.role);
      if (roles.includes('owner')) clientRole = 'owner';
      else if (roles.includes('admin')) clientRole = 'admin';
      accessibleLocationIds = memberships.map(m => m.location_id);
    } else {
      // Backward compat: fallback to user_profiles.location_id
      if (profile.location_id) {
        const { data: loc } = await supabase.from('locations').select('id').eq('id', profile.location_id).eq('status', 'active').is('deleted_at', null).maybeSingle();
        if (loc) accessibleLocationIds = [loc.id];
      }
    }

    req.user = user;
    req.employeeProfile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      location_id: profile.location_id,
      clientId,
      clientRole,
      accessibleLocationIds,
    };
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
 * Middleware factory that verifies the authenticated employee's location_id
 * matches the locationId supplied in the request (params, query, or body).
 * Must be used AFTER authenticateEmployee.
 *
 * @param source - Where to read locationId from: 'params', 'query', or 'body'
 * @param field  - The field name to read (default: 'locationId')
 */
export const validateLocationAccess = (
  source: 'params' | 'query' | 'body',
  field = 'locationId'
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const accessibleIds = req.employeeProfile?.accessibleLocationIds;
    if (!accessibleIds || accessibleIds.length === 0) {
      return res.status(403).json({ error: 'Employee profile missing location access' });
    }

    const requestedLocationId = (req[source] as Record<string, any>)?.[field];

    if (!requestedLocationId) {
      return res.status(400).json({ error: `${field} is required` });
    }

    if (!accessibleIds.includes(requestedLocationId)) {
      return res.status(403).json({ error: 'Access denied: you do not have access to this location' });
    }

    next();
  };
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
