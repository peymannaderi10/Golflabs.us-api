import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../config/database';

interface AuthenticatedRequest extends Request {
  user?: any;
  employeeProfile?: any;
}

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

    // Check if user is an employee
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