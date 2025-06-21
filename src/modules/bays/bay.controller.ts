import { Request, Response } from 'express';
import { BayService } from './bay.service';

export class BayController {
  private bayService: BayService;

  constructor() {
    this.bayService = new BayService();
  }

  getBays = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      const bays = await this.bayService.getBaysByLocationId(locationId as string);
      res.json(bays);
    } catch (error: any) {
      console.error('Error in /bays endpoint:', error);
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 