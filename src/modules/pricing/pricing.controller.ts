import { Request, Response } from 'express';
import { PricingService } from './pricing.service';

export class PricingController {
  private pricingService: PricingService;

  constructor() {
    this.pricingService = new PricingService();
  }

  getPricingRules = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      const pricingRules = await this.pricingService.getPricingRules(locationId as string);
      res.json(pricingRules);
    } catch (error: any) {
      console.error('Error in /pricing-rules endpoint:', error);
      if (error.message === 'Location ID is required') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'An unexpected error occurred' });
    }
  };
} 