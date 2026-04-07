import { Router } from 'express';
import { LocationController } from './location.controller';

export const locationRoutes = Router();

const controller = new LocationController();

// Subdomain resolution (public, must be before /:locationId)
locationRoutes.get('/resolve/:subdomain', controller.resolveSubdomain);
locationRoutes.get('/check-subdomain/:slug', controller.checkSubdomainAvailability);

// Single-location lookup. The list endpoint was removed: tenant resolution
// happens via /resolve/:subdomain so the browser only ever sees its own
// tenant's row. Listing every location was a data-leak surface with no
// remaining caller.
locationRoutes.get('/:locationId', controller.getLocationById);