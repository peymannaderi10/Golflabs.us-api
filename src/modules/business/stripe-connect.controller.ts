import { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { stripeConnectService, StripeConnectError } from './stripe-connect.service';
import { logger } from '../../shared/utils/logger';

/**
 * All routes here are mounted under `/business/locations/:locationId/...`
 * with `[authenticateEmployee, enforceLocationScope]`, so by the time these
 * handlers run we know the caller is an authenticated employee with access
 * to the requested location. We additionally require owner/admin role since
 * connecting a Stripe account is a billing-level decision.
 */

function requireOwnerOrAdmin(req: AuthenticatedRequest, res: Response): boolean {
  const role = req.employeeProfile?.clientRole;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({ success: false, error: 'Only owners or admins can manage Stripe Connect' });
    return false;
  }
  return true;
}

function handleError(error: unknown, res: Response, context: string): Response {
  if (error instanceof StripeConnectError) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  logger.error({ err: error, context }, 'Unexpected error in stripe-connect controller');
  return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
}

export class StripeConnectController {
  /** GET /business/locations/:locationId/stripe-connect/status */
  getStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const status = await stripeConnectService.getStatus(req.params.locationId);
      res.json({ success: true, data: status });
    } catch (error) {
      handleError(error, res, 'stripe-connect.getStatus');
    }
  };

  /**
   * POST /business/locations/:locationId/stripe-connect/onboard
   *
   * Returns `{ url }` — the hosted onboarding link to redirect the user to.
   * Creates the Express account on first call and reuses it on subsequent
   * calls (Stripe lets us mint multiple onboarding links for the same
   * account, useful when an owner abandons partway and returns later).
   */
  startOnboarding = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;

      const ownerEmail = req.user?.email;
      if (!ownerEmail) {
        return res.status(400).json({ success: false, error: 'Authenticated user is missing an email' });
      }

      const accountId = await stripeConnectService.getOrCreateAccount(
        req.params.locationId,
        ownerEmail
      );
      const url = await stripeConnectService.createOnboardingLink(req.params.locationId, accountId);
      res.json({ success: true, data: { url } });
    } catch (error) {
      handleError(error, res, 'stripe-connect.startOnboarding');
    }
  };

  /**
   * POST /business/locations/:locationId/stripe-connect/dashboard
   *
   * Returns `{ url }` — a one-time login link into the Stripe Express
   * dashboard. Only valid for accounts whose onboarding has completed
   * (Stripe rejects the request otherwise, which we surface as 409).
   */
  openDashboard = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;

      const status = await stripeConnectService.getStatus(req.params.locationId);
      if (!status.accountId) {
        return res.status(409).json({ success: false, error: 'No Stripe account connected' });
      }
      const url = await stripeConnectService.createDashboardLink(status.accountId);
      res.json({ success: true, data: { url } });
    } catch (error) {
      handleError(error, res, 'stripe-connect.openDashboard');
    }
  };

  /**
   * DELETE /business/locations/:locationId/stripe-connect
   *
   * Detach this location from its current connected account. Used when a
   * franchisee wants to file taxes/payouts under their own LLC instead of
   * inheriting the corporate-shared account. Sibling locations are
   * unaffected — they continue to use the original account.
   */
  disconnect = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const status = await stripeConnectService.disconnectLocation(req.params.locationId);
      res.json({ success: true, data: status });
    } catch (error) {
      handleError(error, res, 'stripe-connect.disconnect');
    }
  };

  /**
   * POST /business/locations/:locationId/stripe-connect/refresh
   *
   * Force-pulls the latest account state from Stripe and updates the cache.
   * Used when the owner returns from hosted onboarding before the
   * `account.updated` webhook has landed.
   */
  refreshStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireOwnerOrAdmin(req, res)) return;
      const status = await stripeConnectService.refreshStatusForLocation(req.params.locationId);
      res.json({ success: true, data: status });
    } catch (error) {
      handleError(error, res, 'stripe-connect.refreshStatus');
    }
  };
}
