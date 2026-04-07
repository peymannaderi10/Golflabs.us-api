import { Response, NextFunction } from 'express';
import {
  AuthenticatedRequest,
  resolveResourceLocation,
  enforceLocationScope,
} from '../auth/auth.middleware';

/**
 * League-specific tenant gate. Composes the generic `resolveResourceLocation`
 * + `enforceLocationScope` pipeline so leagues share the same security
 * posture as every other resource-param route:
 *
 *   - soft-deleted leagues → 404
 *   - cross-tenant access → 404 (no enumeration oracle)
 *   - whitelisted table lookup, no arbitrary string query construction
 *
 * Exposed as a single middleware (not a chain) so existing route call
 * sites `router.put('/:leagueId', authenticateEmployee, validateLeagueAccess, ...)`
 * keep working. Must run AFTER `authenticateEmployee`.
 */
const resolveLeague = resolveResourceLocation('leagues', 'leagueId');

export const validateLeagueAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // Chain the two steps manually: resolver → enforce.
  resolveLeague(req, res, (err?: any) => {
    if (err) return next(err);
    if (res.headersSent) return;
    enforceLocationScope(req, res, next);
  });
};
