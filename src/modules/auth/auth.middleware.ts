import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../config/database';

export interface AuthenticatedRequest extends Request {
  user?: any;
  employee?: any;
  employeeProfile?: any;
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
    console.error('User authentication error:', error);
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
    console.error('Employee authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
