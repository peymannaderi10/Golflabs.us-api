import { Request, Response } from 'express';
import { LocationService } from './location.service';
import { logger } from '../../shared/utils/logger';
import { AuthenticatedRequest } from '../auth/auth.middleware';

export class LocationController {
  private locationService: LocationService;

  constructor() {
    this.locationService = new LocationService();
  }

  getLocationById = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const location = await this.locationService.getLocationById(locationId);
      res.json(location);
    } catch (error: any) {
      logger.error({ err: error, locationId: req.params.locationId }, 'Error in get location endpoint');
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === 'Location not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getAccessibleLocations = async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const profile = authReq.employeeProfile;
      const accessibleIds = profile?.accessibleLocationIds ?? [];

      if (accessibleIds.length === 0) {
        return res.json({ locations: [], preferredLocationId: null });
      }

      const locations = await this.locationService.getAccessibleLocations(accessibleIds);

      // Server-side default: user_profiles.location_id is the authoritative
      // "default workspace" set by the signup RPC. We only honour it if it
      // is still in the accessible set (defends against stale references
      // after a location is removed from the user's permissions).
      const preferredLocationId =
        profile?.location_id && accessibleIds.includes(profile.location_id)
          ? profile.location_id
          : null;

      res.json({ locations, preferredLocationId });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Error fetching accessible locations');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  resolveSubdomain = async (req: Request, res: Response) => {
    try {
      const { subdomain } = req.params;
      if (!subdomain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain) || subdomain.length < 3 || subdomain.length > 63) {
        return res.status(400).json({ error: 'Invalid subdomain' });
      }
      const location = await this.locationService.resolveBySubdomain(subdomain);
      if (!location) {
        return res.status(404).json({ error: 'Location not found for this subdomain' });
      }
      // Include all sibling locations under the same client so customers
      // on multi-location tenants can switch between them from the booking
      // page. Falls back to a single-element array if no clientId is set.
      const siblings = location.clientId
        ? await this.locationService.getLocationsByClient(location.clientId)
        : [location];

      // Strip employee/admin-only fields before responding to this PUBLIC,
      // unauthenticated endpoint. The customer-facing booking SPA does not
      // need (and should not see) the merchant's Stripe Connect account id,
      // its connect-status flags, billing plan, or internal client id.
      // The employee dashboard fetches the same locations through
      // `/locations/accessible` which keeps these fields intact.
      const stripPrivate = (loc: Record<string, unknown>): Record<string, unknown> => {
        const { stripeConnect: _s, clientId: _c, plan: _p, ...rest } = loc as {
          stripeConnect?: unknown;
          clientId?: unknown;
          plan?: unknown;
        } & Record<string, unknown>;
        return rest;
      };

      res.json({
        ...stripPrivate(location as unknown as Record<string, unknown>),
        siblings: siblings.map((s) => stripPrivate(s as unknown as Record<string, unknown>)),
      });
    } catch (error: any) {
      logger.error({ err: error, subdomain: req.params.subdomain }, 'Error resolving subdomain');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  checkSubdomainAvailability = async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const excludeLocationId = req.query.excludeLocationId as string | undefined;
      const result = await this.locationService.isSubdomainAvailable(slug, excludeLocationId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking subdomain availability');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  updateLocation = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const { salesTaxRate, timezone, status, phone } = req.body;

      const updates: any = {};
      if (salesTaxRate !== undefined) updates.sales_tax_rate = salesTaxRate;
      if (timezone !== undefined) updates.timezone = timezone;
      if (status !== undefined) updates.status = status;
      if (phone !== undefined) updates.phone = phone;

      const location = await this.locationService.updateLocation(locationId, updates);
      res.json(location);
    } catch (error: any) {
      logger.error({ err: error, locationId: req.params.locationId }, 'Error updating location');
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === 'Location not found' || error.message === 'Failed to update location') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 