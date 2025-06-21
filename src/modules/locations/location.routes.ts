import { Router } from 'express';
import { LocationController } from './location.controller';

export const locationRoutes = Router();

const controller = new LocationController();

// Location routes
locationRoutes.get('/', controller.getAllLocations);
locationRoutes.get('/:locationId', controller.getLocationById); 