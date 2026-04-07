import { Router } from 'express';
import { LocationController } from './location.controller';

export const locationRoutes = Router();

const controller = new LocationController();

// Subdomain resolution (public, must be before /:locationId)
locationRoutes.get('/resolve/:subdomain', controller.resolveSubdomain);
locationRoutes.get('/check-subdomain/:slug', controller.checkSubdomainAvailability);

// Location routes
locationRoutes.get('/', controller.getAllLocations);
locationRoutes.get('/:locationId', controller.getLocationById); 