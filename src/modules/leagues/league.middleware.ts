import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { supabase } from '../../config/database';

/**
 * Middleware that verifies the league identified by :leagueId belongs to the
 * authenticated employee's location. Must be used AFTER authenticateEmployee.
 */
export const validateLeagueAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const employeeLocationId = req.employeeProfile?.location_id;
  if (!employeeLocationId) {
    return res.status(403).json({ error: 'Employee profile missing location' });
  }

  const { leagueId } = req.params;
  if (!leagueId) {
    return res.status(400).json({ error: 'leagueId is required' });
  }

  const { data } = await supabase
    .from('leagues')
    .select('location_id')
    .eq('id', leagueId)
    .single();

  if (!data) {
    return res.status(404).json({ error: 'League not found' });
  }

  if (data.location_id !== employeeLocationId) {
    return res.status(403).json({ error: 'Access denied: league belongs to a different location' });
  }

  next();
};
