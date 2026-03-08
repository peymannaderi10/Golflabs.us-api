import { Request, Response } from 'express';
import { LocationService } from './location.service';
import { logger } from '../../shared/utils/logger';

export class LocationController {
  private locationService: LocationService;

  constructor() {
    this.locationService = new LocationService();
  }

  getAllLocations = async (req: Request, res: Response) => {
    try {
      const locations = await this.locationService.getAllLocations();
      res.json(locations);
    } catch (error: any) {
      logger.error({ err: error }, 'Error in /locations endpoint');
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

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