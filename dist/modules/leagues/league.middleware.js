"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLeagueAccess = void 0;
const auth_middleware_1 = require("../auth/auth.middleware");
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
const resolveLeague = (0, auth_middleware_1.resolveResourceLocation)('leagues', 'leagueId');
const validateLeagueAccess = (req, res, next) => {
    // Chain the two steps manually: resolver → enforce.
    resolveLeague(req, res, (err) => {
        if (err)
            return next(err);
        if (res.headersSent)
            return;
        (0, auth_middleware_1.enforceLocationScope)(req, res, next);
    });
};
exports.validateLeagueAccess = validateLeagueAccess;
