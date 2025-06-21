import { Request, Response } from 'express';
import { LocationService } from './location.service';

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
      console.error('Error in /locations endpoint:', error);
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };

  getLocationById = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const location = await this.locationService.getLocationById(locationId);
      res.json(location);
    } catch (error: any) {
      console.error(`Error in /locations/${req.params.locationId} endpoint:`, error);
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === 'Location not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 